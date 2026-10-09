create table if not exists public.line_notification_channels (
  store_id text primary key,
  target_type text not null check (target_type in ('user', 'group', 'room')),
  target_id text not null,
  display_name text not null default '',
  linked_at timestamptz not null default now(),
  last_sent_at timestamptz,
  last_result text,
  notify_submission_reminder boolean not null default true,
  notify_unsubmitted boolean not null default true,
  notify_schedule_published boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.line_link_codes (
  id uuid primary key default gen_random_uuid(),
  store_id text not null,
  code_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists line_link_codes_active_idx
  on public.line_link_codes (code_hash, expires_at)
  where used_at is null;

alter table public.line_notification_channels enable row level security;
alter table public.line_link_codes enable row level security;

comment on table public.line_notification_channels is 'LINE destinations linked to each ShiftFlow store';
comment on table public.line_link_codes is 'Single-use hashed LINE linking codes';
