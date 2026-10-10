-- 0004: Row Level Security. Deny by default. The DB enforces access, not the UI (rule 1).
-- Every role/date rule below is mirrored (never replaced) by lib/rbac.

alter table public.profiles         enable row level security;
alter table public.workbooks        enable row level security;
alter table public.templates        enable row level security;
alter table public.daily_sheets     enable row level security;
alter table public.entries          enable row level security;
alter table public.cell_changes     enable row level security;
alter table public.audit_logs       enable row level security;
alter table public.history_sessions enable row level security;
alter table public.day_status_events enable row level security;
alter table public.attachments      enable row level security;
alter table public.comments         enable row level security;
alter table public.notifications    enable row level security;
alter table public.settings         enable row level security;
alter table public.currencies       enable row level security;

-- ---------- profiles ----------
create policy profiles_select on public.profiles
  for select to authenticated
  using (
    id = auth.uid()
    or app.current_role() = 'super_admin'
    or (app.current_role() = 'admin' and role = 'staff')
  );

-- Self-service is limited to the language column via a column grant below.
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

revoke update on public.profiles from authenticated, anon;
grant update (language) on public.profiles to authenticated;
-- Role changes, enable/disable, and password resets run server-side with the
-- service-role key and bypass RLS.

-- ---------- workbooks / templates ----------
create policy workbooks_select on public.workbooks
  for select to authenticated using (true);

create policy workbooks_write on public.workbooks
  for all to authenticated
  using (app.current_role() = 'super_admin')
  with check (app.current_role() = 'super_admin');

create policy templates_select on public.templates
  for select to authenticated using (true);

create policy templates_write on public.templates
  for all to authenticated
  using (app.current_role() in ('super_admin', 'admin'))
  with check (app.current_role() in ('super_admin', 'admin'));

-- ---------- daily_sheets ----------
create policy daily_sheets_select on public.daily_sheets
  for select to authenticated
  using (
    case app.current_role()
      when 'super_admin' then true
      when 'admin' then true
      when 'staff' then entry_date = app.current_date_amman()
        or app.has_history_session(entry_date)
      else false
    end
  );

-- Status transitions run through RPCs; only admins may touch the row directly.
create policy daily_sheets_update on public.daily_sheets
  for update to authenticated
  using (app.current_role() in ('super_admin', 'admin'))
  with check (app.current_role() in ('super_admin', 'admin'));

-- ---------- entries (core access rule) ----------
create policy entries_select on public.entries
  for select to authenticated
  using (
    case app.current_role()
      when 'super_admin' then true
      when 'admin' then true
      when 'staff' then entry_date = app.current_date_amman()
        or app.has_history_session(entry_date)
      else false
    end
  );

create policy entries_insert on public.entries
  for insert to authenticated
  with check (
    case app.current_role()
      when 'super_admin' then true
      when 'admin' then app.sheet_status(sheet_id) <> 'approved'
      when 'staff' then
        entry_date = app.current_date_amman()
        and app.sheet_status(sheet_id) in ('open', 'returned')
        and not app.has_active_history_session()
        and created_by = auth.uid()
      else false
    end
  );

create policy entries_update on public.entries
  for update to authenticated
  using (
    case app.current_role()
      when 'super_admin' then true
      when 'admin' then app.sheet_status(sheet_id) <> 'approved'
      when 'staff' then
        entry_date = app.current_date_amman()
        and app.sheet_status(sheet_id) in ('open', 'returned')
        and not app.has_active_history_session()
        and created_by = auth.uid()
      else false
    end
  )
  with check (
    case app.current_role()
      when 'super_admin' then true
      when 'admin' then app.sheet_status(sheet_id) <> 'approved'
      when 'staff' then
        entry_date = app.current_date_amman()
        and app.sheet_status(sheet_id) in ('open', 'returned')
        and not app.has_active_history_session()
        and created_by = auth.uid()
      else false
    end
  );

-- No delete policy: entries are soft-deleted via update (rule 6).

-- ---------- cell_changes (read mirrors its entry) ----------
create policy cell_changes_select on public.cell_changes
  for select to authenticated
  using (exists (select 1 from public.entries e where e.id = entry_id));

-- ---------- audit_logs (append-only; visibility per FR-AUD-07) ----------
create policy audit_logs_select on public.audit_logs
  for select to authenticated
  using (
    case app.current_role()
      when 'super_admin' then true
      when 'admin' then (user_id = auth.uid() or role = 'staff')
      when 'staff' then user_id = auth.uid()
      else false
    end
  );

-- ---------- history_sessions ----------
create policy history_sessions_select on public.history_sessions
  for select to authenticated
  using (user_id = auth.uid() or app.current_role() = 'super_admin');

-- ---------- day_status_events ----------
create policy day_status_events_select on public.day_status_events
  for select to authenticated
  using (
    app.current_role() in ('super_admin', 'admin')
    or user_id = auth.uid()
  );

-- ---------- attachments / comments (read mirrors their entry) ----------
create policy attachments_select on public.attachments
  for select to authenticated
  using (exists (select 1 from public.entries e where e.id = entry_id));

create policy attachments_insert on public.attachments
  for insert to authenticated
  with check (
    exists (select 1 from public.entries e where e.id = entry_id)
    and uploaded_by = auth.uid()
  );

create policy comments_select on public.comments
  for select to authenticated
  using (exists (select 1 from public.entries e where e.id = entry_id));

create policy comments_insert on public.comments
  for insert to authenticated
  with check (
    exists (select 1 from public.entries e where e.id = entry_id)
    and author_id = auth.uid()
  );

-- ---------- notifications ----------
create policy notifications_select on public.notifications
  for select to authenticated using (user_id = auth.uid());

create policy notifications_update on public.notifications
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------- settings / currencies ----------
create policy settings_select on public.settings
  for select to authenticated using (true);

create policy settings_write on public.settings
  for all to authenticated
  using (app.current_role() = 'super_admin')
  with check (app.current_role() = 'super_admin');

create policy currencies_select on public.currencies
  for select to authenticated using (true);

create policy currencies_write on public.currencies
  for all to authenticated
  using (app.current_role() = 'super_admin')
  with check (app.current_role() = 'super_admin');
