create table if not exists public.shift_schedules (
  store_id text not null references public.stores(id) on delete cascade,
  week_start date not null,
  assignments jsonb not null default '{}'::jsonb,
  required_staff integer not null default 2 check (required_staff between 1 and 20),
  updated_at timestamptz not null default now(),
  primary key (store_id, week_start)
);

comment on table public.shift_schedules is
  'Manager-created weekly schedule derived from ShiftFlow employee submissions';
