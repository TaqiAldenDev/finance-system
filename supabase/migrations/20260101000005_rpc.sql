-- 0005: privileged RPCs. All are security definer and re-check the caller's
-- role server-side. This is the only path for state transitions and history
-- sessions; the client can never forge them (rule 3, rule 5).

-- Bootstrap a profile for every new auth user. Role defaults to staff;
-- the Super Admin sets roles explicitly through the service-role server action.
create or replace function app.fn_handle_new_user() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, email, role, language, is_active, must_change_password)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email),
    new.email,
    'staff',
    coalesce(nullif(new.raw_user_meta_data ->> 'language', ''), 'en'),
    true,
    true
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app.fn_handle_new_user();

-- Create a sheet for a date if missing, seeding opening balance from the
-- previous approved day's closing balance (FR-DAY-01, FR-DAY-03).
create or replace function app.ensure_sheet(p_workbook uuid, p_date date)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_opening numeric(18, 3) := 0;
begin
  select id into v_id from public.daily_sheets
  where workbook_id = p_workbook and entry_date = p_date;
  if v_id is not null then
    return v_id;
  end if;

  select coalesce(s.closing_balance, 0) into v_opening
  from public.daily_sheets s
  where s.workbook_id = p_workbook
    and s.status = 'approved'
    and s.entry_date < p_date
  order by s.entry_date desc
  limit 1;

  insert into public.daily_sheets (workbook_id, entry_date, opening_balance)
  values (p_workbook, p_date, coalesce(v_opening, 0))
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function app.ensure_today_sheet(p_workbook uuid)
returns uuid
language sql security definer
set search_path = ''
as $$
  select app.ensure_sheet(p_workbook, app.current_date_amman());
$$;

-- Staff (or admin) submits the day for approval.
create or replace function app.submit_day(p_sheet uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_status public.day_status;
  v_role public.user_role := app.current_role();
begin
  if v_role not in ('super_admin', 'admin', 'staff') then
    raise exception 'not allowed';
  end if;

  select status into v_status from public.daily_sheets where id = p_sheet for update;
  if v_status is null then
    raise exception 'sheet not found';
  end if;
  if v_status not in ('open', 'returned') then
    raise exception 'day is not open for submission';
  end if;

  update public.daily_sheets
  set status = 'submitted', submitted_by = auth.uid(), submitted_at = now()
  where id = p_sheet;

  insert into public.day_status_events (sheet_id, from_status, to_status, user_id)
  values (p_sheet, v_status, 'submitted', auth.uid());
end;
$$;

-- Admin approves: locks the day and carries the closing balance forward.
create or replace function app.approve_day(p_sheet uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_status public.day_status;
  v_closing numeric(18, 3);
begin
  if app.current_role() not in ('super_admin', 'admin') then
    raise exception 'not allowed';
  end if;

  select status into v_status from public.daily_sheets where id = p_sheet for update;
  if v_status <> 'submitted' then
    raise exception 'only a submitted day can be approved';
  end if;

  select coalesce(sum(amount), 0) into v_closing
  from public.entries where sheet_id = p_sheet and not is_deleted;

  update public.daily_sheets
  set status = 'approved',
      closing_balance = v_closing,
      approved_by = auth.uid(),
      approved_at = now()
  where id = p_sheet;

  insert into public.day_status_events (sheet_id, from_status, to_status, user_id)
  values (p_sheet, v_status, 'approved', auth.uid());

  -- Closing balance of the approved day becomes the next day's opening balance.
  update public.daily_sheets n
  set opening_balance = v_closing
  from public.daily_sheets c
  where c.id = p_sheet
    and n.workbook_id = c.workbook_id
    and n.entry_date > c.entry_date
    and n.entry_date = (
      select min(d.entry_date) from public.daily_sheets d
      where d.workbook_id = c.workbook_id and d.entry_date > c.entry_date
    );
end;
$$;

-- Admin returns a submitted day with a mandatory comment.
create or replace function app.return_day(p_sheet uuid, p_comment text)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_status public.day_status;
begin
  if app.current_role() not in ('super_admin', 'admin') then
    raise exception 'not allowed';
  end if;
  if p_comment is null or length(btrim(p_comment)) = 0 then
    raise exception 'comment is required';
  end if;

  select status into v_status from public.daily_sheets where id = p_sheet for update;
  if v_status <> 'submitted' then
    raise exception 'only a submitted day can be returned';
  end if;

  update public.daily_sheets
  set status = 'returned'
  where id = p_sheet;

  insert into public.day_status_events (sheet_id, from_status, to_status, user_id, comment)
  values (p_sheet, v_status, 'returned', auth.uid(), p_comment);
end;
$$;

-- Super Admin reopens a locked day, with a reason.
create or replace function app.reopen_day(p_sheet uuid, p_reason text)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_status public.day_status;
begin
  if app.current_role() <> 'super_admin' then
    raise exception 'not allowed';
  end if;
  if p_reason is null or length(btrim(p_reason)) = 0 then
    raise exception 'reason is required';
  end if;

  select status into v_status from public.daily_sheets where id = p_sheet for update;
  if v_status <> 'approved' then
    raise exception 'only a locked day can be reopened';
  end if;

  update public.daily_sheets
  set status = 'open'
  where id = p_sheet;

  insert into public.day_status_events (sheet_id, from_status, to_status, user_id, comment)
  values (p_sheet, v_status, 'open', auth.uid(), p_reason);
end;
$$;

-- Create a 1-hour read-only history session for a past date. Reason required,
-- no extension, one date per session (FR-ACC-04, FR-ACC-07, FR-ACC-08).
create or replace function app.create_history_session(p_date date, p_reason text)
returns table (session_id uuid, expires_at timestamptz)
language plpgsql security definer
set search_path = ''
as $$
declare
  v_minutes integer;
  v_expires timestamptz;
  v_id uuid;
begin
  if auth.uid() is null or not app.is_active() then
    raise exception 'not allowed';
  end if;
  if p_reason is null or length(btrim(p_reason)) < 3 then
    raise exception 'a reason is required';
  end if;
  if p_date >= app.current_date_amman() then
    raise exception 'history sessions are only for past days';
  end if;

  select coalesce((value ->> 'history_session_minutes')::integer, 60)
  into v_minutes
  from public.settings where key = 'history_session';
  v_minutes := coalesce(v_minutes, 60);

  v_expires := now() + make_interval(mins => v_minutes);

  insert into public.history_sessions (user_id, target_date, reason, expires_at)
  values (auth.uid(), p_date, btrim(p_reason), v_expires)
  returning id into v_id;

  return query select v_id, v_expires;
end;
$$;

grant execute on function
  app.ensure_sheet(uuid, date),
  app.ensure_today_sheet(uuid),
  app.submit_day(uuid),
  app.approve_day(uuid),
  app.return_day(uuid, text),
  app.reopen_day(uuid, text),
  app.create_history_session(date, text)
to authenticated;
