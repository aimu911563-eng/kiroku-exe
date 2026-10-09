alter table public.line_notification_channels
  add column if not exists last_unsubmitted_week_start date;

comment on column public.line_notification_channels.last_unsubmitted_week_start is
  'Week already covered by the Wednesday LINE unsubmitted reminder';
