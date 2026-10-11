create table if not exists public.mascot_event_rewards (
  store_id text not null,
  employee_hash text not null,
  event_type text not null check (event_type in ('slime_battle')),
  reward_date date not null,
  xp_awarded integer not null default 50,
  created_at timestamptz not null default now(),
  primary key (store_id, employee_hash, event_type, reward_date)
);

alter table public.mascot_event_rewards enable row level security;

create or replace function public.claim_mascot_event_reward(
  p_store_id text,
  p_employee_hash text,
  p_event_type text,
  p_reward_date date
) returns public.mascot_game_states
language plpgsql
security definer
set search_path = public
as $$
declare result public.mascot_game_states;
declare inserted_count integer;
begin
  if p_event_type <> 'slime_battle' then raise exception 'invalid event'; end if;
  insert into public.mascot_event_rewards (store_id, employee_hash, event_type, reward_date)
  values (p_store_id, p_employee_hash, p_event_type, p_reward_date)
  on conflict do nothing;
  get diagnostics inserted_count = row_count;
  if inserted_count = 0 then raise exception 'reward already claimed'; end if;

  insert into public.mascot_game_states (store_id, employee_hash, xp)
  values (p_store_id, p_employee_hash, 50)
  on conflict (store_id, employee_hash) do update
    set xp = mascot_game_states.xp + 50, updated_at = now()
  returning * into result;
  return result;
end;
$$;

revoke all on function public.claim_mascot_event_reward(text, text, text, date) from public;
grant execute on function public.claim_mascot_event_reward(text, text, text, date) to service_role;
