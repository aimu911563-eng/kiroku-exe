create table if not exists public.employee_feedback (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  message text not null,
  app_version text not null default 'unknown',
  source text not null default 'employee_web',
  status text not null default 'new',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employee_feedback_category_check
    check (category in ('改善してほしい', '新しい機能', '不具合', 'その他')),
  constraint employee_feedback_message_length_check
    check (char_length(message) between 1 and 500),
  constraint employee_feedback_status_check
    check (status in ('new', 'reviewing', 'planned', 'completed', 'closed'))
);

create index if not exists employee_feedback_status_created_at_idx
  on public.employee_feedback (status, created_at desc);

alter table public.employee_feedback enable row level security;

comment on table public.employee_feedback is
  'Anonymous feedback submitted from the ShiftFlow employee web UI. Access is limited to the server service role.';
