alter table public.shift_schedules
  add column if not exists required_staff_weekday integer check (required_staff_weekday between 1 and 20),
  add column if not exists required_staff_weekend_holiday integer check (required_staff_weekend_holiday between 1 and 20);

update public.shift_schedules
set
  required_staff_weekday = coalesce(required_staff_weekday, required_staff, 2),
  required_staff_weekend_holiday = coalesce(required_staff_weekend_holiday, required_staff, 2)
where required_staff_weekday is null
   or required_staff_weekend_holiday is null;

alter table public.shift_schedules
  alter column required_staff_weekday set default 2,
  alter column required_staff_weekday set not null,
  alter column required_staff_weekend_holiday set default 2,
  alter column required_staff_weekend_holiday set not null;

comment on column public.shift_schedules.required_staff_weekday is
  'Minimum staffing target for Monday through Thursday';
comment on column public.shift_schedules.required_staff_weekend_holiday is
  'Minimum staffing target for Friday, Saturday, Sunday, and Japanese holidays';
