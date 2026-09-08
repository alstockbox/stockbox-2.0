begin;

create or replace function public.advance_recommendation_v3_calibration(
  p_candidate_key text,
  p_expected_stage text,
  p_next_stage text,
  p_backtest_improved boolean default null,
  p_shadow_improved boolean default null,
  p_explicit_approval boolean default false,
  p_reason text default null,
  p_occurred_at timestamptz default now()
)
returns setof public.analysis_recommendation_v3_calibration_candidates
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_candidate public.analysis_recommendation_v3_calibration_candidates%rowtype;
  v_backtest_improved boolean;
  v_shadow_improved boolean;
  v_explicit_approval boolean;
begin
  select *
  into v_candidate
  from public.analysis_recommendation_v3_calibration_candidates
  where candidate_key = p_candidate_key
  for update;

  if not found then
    raise exception 'CALIBRATION_CANDIDATE_NOT_FOUND';
  end if;

  if v_candidate.stage <> p_expected_stage then
    raise exception 'CALIBRATION_STAGE_CONFLICT';
  end if;

  if not (
    (p_expected_stage = 'CANDIDATE' and p_next_stage = 'BACKTESTED')
    or (p_expected_stage = 'BACKTESTED' and p_next_stage = 'SHADOW_VALIDATED')
    or (p_expected_stage = 'SHADOW_VALIDATED' and p_next_stage = 'APPROVED')
    or (p_expected_stage = 'APPROVED' and p_next_stage = 'PRODUCTION')
  ) then
    raise exception 'INVALID_CALIBRATION_STAGE_TRANSITION';
  end if;

  v_backtest_improved := coalesce(p_backtest_improved, v_candidate.backtest_improved);
  v_shadow_improved := coalesce(p_shadow_improved, v_candidate.shadow_improved);
  v_explicit_approval := v_candidate.explicit_approval or coalesce(p_explicit_approval, false);

  if p_next_stage = 'SHADOW_VALIDATED' and v_backtest_improved is not true then
    raise exception 'CALIBRATION_BACKTEST_IMPROVEMENT_REQUIRED';
  end if;

  if p_next_stage = 'APPROVED' and v_shadow_improved is not true then
    raise exception 'CALIBRATION_SHADOW_IMPROVEMENT_REQUIRED';
  end if;

  if p_next_stage = 'PRODUCTION' and not (
    v_backtest_improved is true
    and v_shadow_improved is true
    and v_explicit_approval is true
  ) then
    raise exception 'CALIBRATION_EXPLICIT_APPROVAL_AND_EVIDENCE_REQUIRED';
  end if;

  update public.analysis_recommendation_v3_calibration_candidates
  set
    stage = p_next_stage,
    backtest_improved = v_backtest_improved,
    shadow_improved = v_shadow_improved,
    explicit_approval = v_explicit_approval,
    approved_at = case
      when p_next_stage in ('APPROVED', 'PRODUCTION') then coalesce(approved_at, p_occurred_at)
      else approved_at
    end,
    production_at = case
      when p_next_stage = 'PRODUCTION' then coalesce(production_at, p_occurred_at)
      else production_at
    end,
    updated_at = p_occurred_at
  where id = v_candidate.id
  returning * into v_candidate;

  insert into public.analysis_recommendation_v3_calibration_events (
    candidate_id,
    from_stage,
    to_stage,
    backtest_improved,
    shadow_improved,
    explicit_approval,
    reason,
    occurred_at
  ) values (
    v_candidate.id,
    p_expected_stage,
    p_next_stage,
    v_backtest_improved,
    v_shadow_improved,
    v_explicit_approval,
    nullif(btrim(p_reason), ''),
    p_occurred_at
  );

  return next v_candidate;
end;
$$;

revoke all on function public.advance_recommendation_v3_calibration(
  text, text, text, boolean, boolean, boolean, text, timestamptz
) from public;
revoke all on function public.advance_recommendation_v3_calibration(
  text, text, text, boolean, boolean, boolean, text, timestamptz
) from anon;
revoke all on function public.advance_recommendation_v3_calibration(
  text, text, text, boolean, boolean, boolean, text, timestamptz
) from authenticated;
grant execute on function public.advance_recommendation_v3_calibration(
  text, text, text, boolean, boolean, boolean, text, timestamptz
) to service_role;

comment on function public.advance_recommendation_v3_calibration(
  text, text, text, boolean, boolean, boolean, text, timestamptz
) is 'Atomically advances a private StockBox 3.0 calibration candidate and appends immutable transition evidence. Production requires backtest improvement, shadow improvement and explicit approval.';

commit;
