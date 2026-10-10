-- 0002: helper functions in the `app` schema.
-- These are the ONLY source of role/date truth used by RLS. Never trust the client.
-- security definer + empty search_path so policy evaluation can read profiles
-- without triggering RLS recursion and without search_path attacks.

create schema if not exists app;

-- Server date in Asia/Amman. Never read the date from the client (rule 2).
create or replace function app.current_date_amman() returns date
language sql stable
set search_path = ''
as $$
  select (now() at time zone 'Asia/Amman')::date;
$$;

-- Role of the calling user, from profiles (not from the JWT claims we don't control).
create or replace function app.current_role() returns public.user_role
language sql stable security definer
set search_path = ''
as $$
  select role from public.profiles where id = auth.uid();
$$;

-- Is the calling user active?
create or replace function app.is_active() returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce((select is_active from public.profiles where id = auth.uid()), false);
$$;

-- Does an unexpired history session exist for the given date?
create or replace function app.has_history_session(p_date date) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.history_sessions h
    where h.user_id = auth.uid()
      and h.target_date = p_date
      and h.expires_at > now()
  );
$$;

-- Is there ANY unexpired history session for the caller? (writes are frozen during one)
create or replace function app.has_active_history_session() returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.history_sessions h
    where h.user_id = auth.uid()
      and h.expires_at > now()
  );
$$;

create or replace function app.sheet_status(p_id uuid) returns public.day_status
language sql stable security definer
set search_path = ''
as $$
  select status from public.daily_sheets where id = p_id;
$$;

create or replace function app.sheet_date(p_id uuid) returns date
language sql stable security definer
set search_path = ''
as $$
  select entry_date from public.daily_sheets where id = p_id;
$$;

revoke execute on all functions in schema app from public;
grant usage on schema app to authenticated, service_role;
grant execute on all functions in schema app to authenticated, service_role;
