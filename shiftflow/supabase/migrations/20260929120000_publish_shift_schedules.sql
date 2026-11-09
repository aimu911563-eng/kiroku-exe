alter table public.shift_schedules
  add column if not exists published_at timestamptz;

comment on column public.shift_schedules.published_at is
  'When set, the weekly schedule is visible in the employee calendar';
