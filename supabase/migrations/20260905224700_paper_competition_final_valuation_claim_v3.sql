begin;

create or replace function public.claim_final_paper_competition_valuation_v3(
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
  v_now timestamptz := clock_timestamp();
  v_lease_token uuid := gen_random_uuid();
begin
  if p_competition_id is null then
    return query select false, null::uuid, v_now, null::timestamptz;
    return;
  end if;

  -- Serialize final claims for one competition. The competition row owns the
  -- immutable final cutoff (ends_at); callers can provide only the id.
  select *
    into v_competition
  from public.paper_competitions_v3
  where id = p_competition_id
  for update;

  if not found then
    return query select false, null::uuid, v_now, null::timestamptz;
    return;
  end if;

  -- Refresh after any lock wait so lease/cooldown decisions use the real DB
  -- wall clock while the valuation cutoff remains exactly competition ends_at.
  v_now := clock_timestamp();

  if v_competition.status <> 'completed'
    or v_competition.kind not in ('challenge', 'private_league')
    or v_now <= v_competition.ends_at
  then
    return query select false, null::uuid, v_competition.ends_at, null::timestamptz;
    return;
  end if;

  select *
    into v_control
  from public.paper_competition_valuation_control_v3
  where competition_id = p_competition_id;

  if found and v_control.last_verified_evaluation_cutoff = v_competition.ends_at then
    return query select false, null::uuid, v_competition.ends_at, null::timestamptz;
    return;
  end if;

  if found and v_control.lease_expires_at is not null and v_control.lease_expires_at > v_now then
    return query select false, null::uuid, v_competition.ends_at, null::timestamptz;
    return;
  end if;

  -- Only throttle a previous FINAL attempt. A recent ordinary in-window
  -- valuation at another cutoff must not prevent the first final attempt.
  if found
    and v_control.last_evaluation_cutoff = v_competition.ends_at
    and v_control.last_completed_at is not null
    and v_control.last_completed_at > v_now - interval '15 minutes'
  then
    return query select false, null::uuid, v_competition.ends_at, null::timestamptz;
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
    v_competition.ends_at,
    v_lease_token,
    v_now + interval '10 minutes',
    v_now
  )
  on conflict (competition_id) do update
    set last_claimed_at = v_competition.ends_at,
        lease_token = v_lease_token,
        lease_expires_at = v_now + interval '10 minutes',
        updated_at = v_now;

  return query select true, v_lease_token, v_competition.ends_at, v_now + interval '10 minutes';
end;
$$;

revoke all on function public.claim_final_paper_competition_valuation_v3(uuid) from public, anon, authenticated;
grant execute on function public.claim_final_paper_competition_valuation_v3(uuid) to service_role;

commit;
