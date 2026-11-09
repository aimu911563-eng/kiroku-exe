alter table public.stores
  add column if not exists business_hours jsonb;

update public.stores
set business_hours = case id
  when 'terajima' then '{"weekday":{"open":"10:00","close":"23:00"},"weekendHoliday":{"open":"10:00","close":"24:00"}}'::jsonb
  when 'hamakita' then '{"weekday":{"open":"10:00","close":"21:00"},"weekendHoliday":{"open":"10:00","close":"22:00"}}'::jsonb
  when 'kosai' then '{"weekday":{"open":"15:00","close":"22:00"},"weekendHoliday":{"open":"10:00","close":"22:00"}}'::jsonb
  else '{"weekday":{"open":"10:00","close":"23:00"},"weekendHoliday":{"open":"10:00","close":"24:00"}}'::jsonb
end
where business_hours is null;

comment on column public.stores.business_hours is
  'ShiftFlow hours: weekday and weekendHoliday objects with open/close HH:MM values';
