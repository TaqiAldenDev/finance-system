-- 0001: enums, tables, indexes.
-- Source of truth for schema. RLS/audit live in later migrations.
-- Money is numeric (never float). Timestamps are timestamptz (UTC).

create type public.user_role as enum ('super_admin', 'admin', 'staff');
create type public.day_status as enum ('open', 'submitted', 'returned', 'approved');

-- One row per user, linked to Supabase Auth. Role lives here, not in the client.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  email text not null,
  role public.user_role not null default 'staff',
  language text not null default 'en',
  is_active boolean not null default true,
  must_change_password boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_language_check check (language in ('en', 'ar'))
);

create table public.workbooks (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  template_id uuid,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  columns jsonb not null default '[]'::jsonb,
  validations jsonb not null default '{}'::jsonb,
  version integer not null default 1,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.workbooks
  add constraint workbooks_template_fk
  foreign key (template_id) references public.templates (id) on delete set null;

-- One sheet per workbook per date.
create table public.daily_sheets (
  id uuid primary key default gen_random_uuid(),
  workbook_id uuid not null references public.workbooks (id) on delete cascade,
  entry_date date not null,
  status public.day_status not null default 'open',
  opening_balance numeric(18, 3) not null default 0,
  closing_balance numeric(18, 3) not null default 0,
  submitted_by uuid references public.profiles (id),
  submitted_at timestamptz,
  approved_by uuid references public.profiles (id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (workbook_id, entry_date)
);

-- The rows users enter.
create table public.entries (
  id uuid primary key default gen_random_uuid(),
  sheet_id uuid not null references public.daily_sheets (id) on delete cascade,
  entry_date date not null,
  category text,
  amount numeric(18, 3),
  currency text not null default 'JOD',
  reference text,
  data jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles (id),
  is_deleted boolean not null default false,
  deleted_at timestamptz,
  deleted_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Per-cell change history (FR-AUD-06).
create table public.cell_changes (
  id bigserial primary key,
  entry_id uuid not null references public.entries (id) on delete cascade,
  column_name text not null,
  old_value text,
  new_value text,
  changed_by uuid references public.profiles (id),
  changed_at timestamptz not null default now()
);

-- Append-only record of every operation (FR-AUD-01/02).
create table public.audit_logs (
  id bigserial primary key,
  user_id uuid,
  role public.user_role,
  action text not null,
  target_type text,
  target_id text,
  old_value jsonb,
  new_value jsonb,
  ip inet,
  user_agent text,
  request_id uuid,
  created_at timestamptz not null default now()
);

-- The 1-hour read-only access grants.
create table public.history_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  target_date date not null,
  reason text not null,
  started_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create table public.day_status_events (
  id uuid primary key default gen_random_uuid(),
  sheet_id uuid not null references public.daily_sheets (id) on delete cascade,
  from_status public.day_status,
  to_status public.day_status not null,
  user_id uuid references public.profiles (id),
  comment text,
  created_at timestamptz not null default now()
);

create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.entries (id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  size bigint,
  uploaded_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.entries (id) on delete cascade,
  body text not null,
  author_id uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_by uuid references public.profiles (id),
  updated_at timestamptz not null default now()
);

create table public.currencies (
  code text primary key,
  name text not null,
  rate numeric(18, 6) not null default 1,
  effective_date date not null default current_date
);

create index entries_sheet_idx on public.entries (sheet_id);
create index entries_date_idx on public.entries (entry_date);
create index cell_changes_entry_idx on public.cell_changes (entry_id);
create index audit_logs_user_idx on public.audit_logs (user_id, created_at desc);
create index audit_logs_action_idx on public.audit_logs (action);
create index audit_logs_created_idx on public.audit_logs (created_at desc);
create index history_sessions_user_date_idx on public.history_sessions (user_id, target_date);
create index day_status_events_sheet_idx on public.day_status_events (sheet_id);
