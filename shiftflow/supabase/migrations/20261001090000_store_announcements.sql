create table if not exists public.store_announcements (
  store_id text primary key,
  message text not null default '',
  is_active boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint store_announcements_message_length check (char_length(message) <= 300)
);

alter table public.store_announcements enable row level security;

comment on table public.store_announcements is 'One current manager announcement per ShiftFlow store';
