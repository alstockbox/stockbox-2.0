begin;

alter table public.paper_competition_valuation_control_v3
  add column if not exists last_verified_at timestamptz,
  add column if not exists last_verified_evaluation_cutoff timestamptz;

alter table public.paper_competition_valuation_control_v3
  drop constraint if exists paper_competition_valuation_control_v3_verified_pointer_check;

alter table public.paper_competition_valuation_control_v3
  add constraint paper_competition_valuation_control_v3_verified_pointer_check
  check (
    (last_verified_at is null and last_verified_evaluation_cutoff is null)
    or (
      last_verified_at is not null
      and last_verified_evaluation_cutoff is not null
      and last_verified_at >= last_verified_evaluation_cutoff
    )
  );

create or replace function public.complete_paper_competition_valuation_v3(
  p_competition_id uuid,
  p_lease_token uuid,
  p_evaluation_cutoff timestamptz,
  p_outcome text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_control public.paper_competition_valuation_control_v3%rowtype;
  v_now timestamptz := clock_timestamp();
  v_outcome text := lower(trim(p_outcome));
  v_updated integer := 0;
begin
  if p_competition_id is null or p_lease_token is null then
    return false;
  end if;

  if v_outcome is null or v_outcome not in ('verified', 'unavailable', 'error') then
    raise exception 'invalid valuation outcome';
  end if;

  select *
    into v_control
  from public.paper_competition_valuation_control_v3
  where competition_id = p_competition_id
  for update;

  if not found
    or v_control.lease_token is null
    or v_control.lease_token <> p_lease_token
  then
    return false;
  end if;

  if p_evaluation_cutoff is distinct from v_control.last_claimed_at then
    raise exception 'valuation cutoff does not match claim';
  end if;

  if v_outcome = 'verified'
    and v_control.last_verified_evaluation_cutoff is not null
    and p_evaluation_cutoff < v_control.last_verified_evaluation_cutoff
  then
    raise exception 'verified valuation cutoff cannot move backwards';
  end if;

  v_now := clock_timestamp();

  update public.paper_competition_valuation_control_v3
  set last_completed_at = v_now,
      last_evaluation_cutoff = p_evaluation_cutoff,
      last_outcome = v_outcome,
      last_verified_at = case
        when v_outcome = 'verified' then v_now
        else last_verified_at
      end,
      last_verified_evaluation_cutoff = case
        when v_outcome = 'verified' then p_evaluation_cutoff
        else last_verified_evaluation_cutoff
      end,
      lease_token = null,
      lease_expires_at = null,
      updated_at = v_now
  where competition_id = p_competition_id
    and lease_token = p_lease_token;

  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

revoke all on function public.complete_paper_competition_valuation_v3(uuid, uuid, timestamptz, text) from public, anon, authenticated;
grant execute on function public.complete_paper_competition_valuation_v3(uuid, uuid, timestamptz, text) to service_role;

commit;
