create table if not exists public.mascot_events (
  id uuid primary key default gen_random_uuid(),
  store_id text not null,
  employee_hash text not null,
  event_type text not null check (event_type in ('view', 'tap')),
  event_date date not null,
  created_at timestamptz not null default now(),
  unique (store_id, employee_hash, event_type, event_date)
);

create index if not exists mascot_events_date_idx on public.mascot_events (store_id, event_date desc);
alter table public.mascot_events enable row level security;
comment on table public.mascot_events is 'Anonymous daily mascot view and tap events for product analysis';
