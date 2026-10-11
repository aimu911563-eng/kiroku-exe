create table if not exists public.mascot_game_states (
  store_id text not null,
  employee_hash text not null,
  xp integer not null default 0 check (xp >= 0),
  coolness integer not null default 0 check (coolness >= 0),
  cuteness integer not null default 0 check (cuteness >= 0),
  beauty integer not null default 0 check (beauty >= 0),
  slime_available_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (store_id, employee_hash)
);

alter table public.mascot_game_states enable row level security;
comment on table public.mascot_game_states is 'Persistent anonymous mascot game progress';

create or replace function public.add_mascot_tap_xp(
  p_store_id text,
  p_employee_hash text,
  p_amount integer
) returns public.mascot_game_states
language plpgsql
security definer
set search_path = public
as $$
declare result public.mascot_game_states;
begin
  if p_amount < 1 or p_amount > 20 then
    raise exception 'invalid tap amount';
  end if;
  insert into public.mascot_game_states (store_id, employee_hash, xp)
  values (p_store_id, p_employee_hash, p_amount)
  on conflict (store_id, employee_hash) do update
    set xp = mascot_game_states.xp + excluded.xp, updated_at = now()
  returning * into result;
  return result;
end;
$$;

create or replace function public.claim_mascot_slime(
  p_store_id text,
  p_employee_hash text
) returns public.mascot_game_states
language plpgsql
security definer
set search_path = public
as $$
declare result public.mascot_game_states;
begin
  insert into public.mascot_game_states (store_id, employee_hash)
  values (p_store_id, p_employee_hash)
  on conflict (store_id, employee_hash) do nothing;

  update public.mascot_game_states
  set xp = xp + 100,
      slime_available_at = now() + make_interval(secs => (14400 + floor(random() * 28800))::integer),
      updated_at = now()
  where store_id = p_store_id
    and employee_hash = p_employee_hash
    and slime_available_at <= now()
  returning * into result;

  if result.store_id is null then
    raise exception 'slime unavailable';
  end if;
  return result;
end;
$$;

create or replace function public.spend_mascot_stat(
  p_store_id text,
  p_employee_hash text,
  p_stat text
) returns public.mascot_game_states
language plpgsql
security definer
set search_path = public
as $$
declare result public.mascot_game_states;
declare earned_points integer;
declare spent_points integer;
begin
  select least(99, floor(sqrt(xp::numeric / 25))::integer),
         coolness + cuteness + beauty
    into earned_points, spent_points
  from public.mascot_game_states
  where store_id = p_store_id and employee_hash = p_employee_hash
  for update;

  if earned_points is null or spent_points >= earned_points then
    raise exception 'no stat points';
  end if;
  if p_stat not in ('coolness', 'cuteness', 'beauty') then
    raise exception 'invalid stat';
  end if;

  update public.mascot_game_states
  set coolness = coolness + case when p_stat = 'coolness' then 1 else 0 end,
      cuteness = cuteness + case when p_stat = 'cuteness' then 1 else 0 end,
      beauty = beauty + case when p_stat = 'beauty' then 1 else 0 end,
      updated_at = now()
  where store_id = p_store_id and employee_hash = p_employee_hash
  returning * into result;
  return result;
end;
$$;

revoke all on function public.add_mascot_tap_xp(text, text, integer) from public;
revoke all on function public.claim_mascot_slime(text, text) from public;
revoke all on function public.spend_mascot_stat(text, text, text) from public;
grant execute on function public.add_mascot_tap_xp(text, text, integer) to service_role;
grant execute on function public.claim_mascot_slime(text, text) to service_role;
grant execute on function public.spend_mascot_stat(text, text, text) to service_role;
