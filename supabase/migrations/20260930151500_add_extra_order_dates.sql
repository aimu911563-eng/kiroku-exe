alter table public.order_settings
  add column if not exists extra_order_dates date[] not null default '{}'::date[];

comment on column public.order_settings.extra_order_dates is 'One-off order dates in addition to recurring weekdays';
