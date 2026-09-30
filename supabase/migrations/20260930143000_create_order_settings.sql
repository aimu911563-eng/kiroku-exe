create table if not exists public.order_settings (
  store_id text primary key,
  order_days smallint[] not null,
  updated_at timestamptz not null default now(),
  constraint order_settings_days_count check (cardinality(order_days) between 1 and 7)
);

alter table public.order_settings enable row level security;

insert into public.order_settings (store_id, order_days)
values
  ('7249', array[2, 5]::smallint[]),
  ('7539', array[1, 4]::smallint[])
on conflict (store_id) do nothing;

comment on table public.order_settings is 'Store-specific recurring order weekdays (0=Sun ... 6=Sat)';
