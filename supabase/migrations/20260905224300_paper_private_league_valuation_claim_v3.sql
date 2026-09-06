begin;

create or replace function public.claim_private_paper_league_valuation_v3(
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

  -- Serialize every valuation claimant for this competition on the same row
  -- used by the challenge claim RPC before consulting shared control state.
  select *
    into v_competition
  from public.paper_competitions_v3
  where id = p_competition_id
  for update;

  if not found then
    return query select false, null::uuid, v_now, null::timestamptz;
    return;
  end if;

  -- Refresh the DB-owned wall clock after any lock wait. The caller cannot
  -- supply a clock, kind, cooldown or lease duration.
  v_now := clock_timestamp();

  if v_competition.kind <> 'private_league'
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
    set last_claimed_at = v_now,
        lease_token = v_lease_token,
        lease_expires_at = v_now + interval '10 minutes',
        updated_at = v_now;

  return query select true, v_lease_token, v_now, v_now + interval '10 minutes';
end;
$$;

revoke all on function public.claim_private_paper_league_valuation_v3(uuid) from public, anon, authenticated;
grant execute on function public.claim_private_paper_league_valuation_v3(uuid) to service_role;

commit;
