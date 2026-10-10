-- 0003: audit + change tracking.
-- Audit rows are written by triggers in the same transaction as the change
-- (rule 4 / FR-AUD-04). The table is append-only: no update/delete grants,
-- plus a trigger that blocks mutation even for the owner.

-- Generic row audit. Captures old/new, user, role, IP, device, request id.
create or replace function app.fn_audit() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_headers json;
  v_old jsonb := 'null'::jsonb;
  v_new jsonb := 'null'::jsonb;
  v_target text;
  v_ip inet;
begin
  if tg_op = 'INSERT' then
    v_new := to_jsonb(new);
  elsif tg_op = 'UPDATE' then
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
  else
    v_old := to_jsonb(old);
  end if;

  v_target := coalesce(v_new ->> 'id', v_old ->> 'id');

  begin
    v_headers := current_setting('request.headers', true)::json;
  exception when others then
    v_headers := null;
  end;

  begin
    v_ip := nullif(split_part(coalesce(v_headers ->> 'x-forwarded-for', ''), ',', 1), '')::inet;
  exception when others then
    v_ip := null;
  end;

  insert into public.audit_logs
    (user_id, role, action, target_type, target_id, old_value, new_value, ip, user_agent, request_id)
  values
    (auth.uid(), app.current_role(), tg_op, tg_table_name, v_target, v_old, v_new,
     v_ip, v_headers ->> 'user-agent', null);

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- Per-cell change history for entries (FR-AUD-06).
create or replace function app.fn_cell_changes() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  k text;
  ov jsonb;
  nv jsonb;
  n jsonb := to_jsonb(new);
  o jsonb := to_jsonb(old);
begin
  for k in select jsonb_object_keys(n) loop
    if k = 'updated_at' then
      continue;
    end if;
    ov := o -> k;
    nv := n -> k;
    if ov is distinct from nv then
      insert into public.cell_changes (entry_id, column_name, old_value, new_value, changed_by)
      values (new.id, k, ov #>> '{}', nv #>> '{}', auth.uid());
    end if;
  end loop;
  return new;
end;
$$;

-- Append-only enforcement.
create or replace function app.fn_block_audit_mutation() returns trigger
language plpgsql
as $$
begin
  raise exception 'audit_logs is append-only';
end;
$$;

create trigger audit_logs_append_only
  before update or delete on public.audit_logs
  for each row execute function app.fn_block_audit_mutation();

revoke update, delete, truncate on public.audit_logs from authenticated, anon;

-- updated_at maintenance.
create or replace function app.fn_set_updated_at() returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger entries_set_updated_at
  before update on public.entries
  for each row execute function app.fn_set_updated_at();

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function app.fn_set_updated_at();

create trigger settings_set_updated_at
  before update on public.settings
  for each row execute function app.fn_set_updated_at();

-- Keep entries.entry_date consistent with its sheet.
create or replace function app.fn_assert_entry_date() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.entry_date <> app.sheet_date(new.sheet_id) then
    raise exception 'entry_date must match its sheet date';
  end if;
  return new;
end;
$$;

create trigger entries_assert_date
  before insert or update on public.entries
  for each row execute function app.fn_assert_entry_date();

-- Change tracking on entries.
create trigger entries_cell_changes
  after update on public.entries
  for each row execute function app.fn_cell_changes();

-- Row audit on the sensitive tables.
create trigger entries_audit
  after insert or update or delete on public.entries
  for each row execute function app.fn_audit();

create trigger daily_sheets_audit
  after insert or update or delete on public.daily_sheets
  for each row execute function app.fn_audit();

create trigger profiles_audit
  after insert or update or delete on public.profiles
  for each row execute function app.fn_audit();

create trigger history_sessions_audit
  after insert or update or delete on public.history_sessions
  for each row execute function app.fn_audit();

create trigger settings_audit
  after insert or update or delete on public.settings
  for each row execute function app.fn_audit();

create trigger attachments_audit
  after insert or update or delete on public.attachments
  for each row execute function app.fn_audit();
