begin;

create table if not exists public.paper_competition_valuation_control_v3 (
  competition_id uuid primary key
    references public.paper_competitions_v3(id) on delete cascade,
  last_claimed_at timestamptz,
  lease_token uuid,
  lease_expires_at timestamptz,
  updated_at timestamptz not null default now(),
  check (
    (lease_token is null and lease_expires_at is null)
    or (lease_token is not null and lease_expires_at is not null)
  )
);

alter table public.paper_competition_valuation_control_v3 enable row level security;

revoke all on table public.paper_competition_valuation_control_v3 from public, anon, authenticated;

create or replace function public.claim_paper_competition_valuation_v3(
  p_competition_id uuid
)
returns table (
  claimed boolean,
  lease_token uuid,
  claimed_at timestamptz,
  lease_expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_competition public.paper_competitions_v3%rowtype;
  v_control public.paper_competition_valuation_control_v3%rowtype;
  v_now timestamptz := now();
  v_lease_token uuid := gen_random_uuid();
begin
  if p_competition_id is null then
    return query select false, null::uuid, v_now, null::timestamptz;
    return;
  end if;

  -- Serialize all claims for one competition before reading or creating the
  -- corresponding control row. This prevents parallel workers from both
  -- passing the cooldown/lease checks.
  select *
    into v_competition
  from public.paper_competitions_v3
  where id = p_competition_id
  for update;

  if not found then
    return query select false, null::uuid, v_now, null::timestamptz;
    return;
  end if;

  -- Refresh the database-owned wall clock after any row-lock wait. The caller
  -- has no clock or duration parameter and therefore cannot bypass the policy.
  v_now := clock_timestamp();

  if v_competition.kind <> 'challenge'
    or v_competition.status <> 'active'
    or v_now < v_competition.starts_at
    or v_now > v_competition.ends_at
  then
    return query select false, null::uuid, v_now, null::timestamptz;
    return;
  end if;

  select *
    into v_control
  from public.paper_competition_valuation_control_v3
  where competition_id = p_competition_id;

  if found and (
    (v_control.lease_expires_at is not null and v_control.lease_expires_at > v_now)
    or (v_control.last_claimed_at is not null and v_control.last_claimed_at > v_now - interval '15 minutes')
  ) then
    return query select false, null::uuid, v_now, null::timestamptz;
    return;
  end if;

  insert into public.paper_competition_valuation_control_v3 (
    competition_id,
    last_claimed_at,
    lease_token,
    lease_expires_at,
    updated_at
  ) values (
    p_competition_id,
    v_now,
    v_lease_token,
    v_now + interval '10 minutes',
    v_now
  )
  on conflict (competition_id) do update
    set last_claimed_at = excluded.last_claimed_at,
        lease_token = excluded.lease_token,
        lease_expires_at = excluded.lease_expires_at,
        updated_at = excluded.updated_at;

  return query select true, v_lease_token, v_now, v_now + interval '10 minutes';
end;
$$;

revoke all on function public.claim_paper_competition_valuation_v3(uuid) from public, anon, authenticated;
grant execute on function public.claim_paper_competition_valuation_v3(uuid) to service_role;

commit;
