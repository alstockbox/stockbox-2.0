begin;

create or replace function public.persist_recommendation_v3_calibration_candidate(
  p_row jsonb,
  p_evaluated_at timestamptz
)
returns table(stage text, created boolean, refreshed boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_input record;
  v_created_id uuid;
  v_stage text;
  v_current_updated_at timestamptz;
  v_policy_version text;
  v_horizon text;
  v_rating text;
  v_analysis_archetype text;
  v_model_version text;
  v_recommendation_policy_version text;
begin
  if p_row is null or jsonb_typeof(p_row) <> 'object' then
    raise exception 'CALIBRATION_CANDIDATE_ROW_MUST_BE_OBJECT';
  end if;
  if p_evaluated_at is null then
    raise exception 'CALIBRATION_CANDIDATE_EVALUATED_AT_REQUIRED';
  end if;

  if exists (
    select 1
    from jsonb_object_keys(p_row) as k(key_name)
    where k.key_name not in (
      'candidate_key',
      'candidate_id',
      'policy_version',
      'created_at',
      'stage',
      'horizon',
      'rating',
      'analysis_archetype',
      'model_version',
      'recommendation_policy_version',
      'sample_size',
      'benchmark_sample_size',
      'hit_rate',
      'mean_excess_return',
      'median_excess_return',
      'reasons',
      'backtest_improved',
      'shadow_improved',
      'backtest_evidence_id',
      'shadow_evidence_id',
      'explicit_approval',
      'approved_at',
      'production_at',
      'updated_at'
    )
  ) then
    raise exception 'CALIBRATION_CANDIDATE_ROW_FIELD_NOT_ALLOWED';
  end if;

  select *
  into v_input
  from jsonb_to_record(p_row) as x(
    candidate_key text,
    candidate_id text,
    policy_version text,
    created_at timestamptz,
    stage text,
    horizon text,
    rating text,
    analysis_archetype text,
    model_version text,
    recommendation_policy_version text,
    sample_size integer,
    benchmark_sample_size integer,
    hit_rate numeric,
    mean_excess_return numeric,
    median_excess_return numeric,
    reasons text[],
    backtest_improved boolean,
    shadow_improved boolean,
    backtest_evidence_id uuid,
    shadow_evidence_id uuid,
    explicit_approval boolean,
    approved_at timestamptz,
    production_at timestamptz,
    updated_at timestamptz
  );

  if btrim(coalesce(v_input.candidate_key, '')) = ''
    or btrim(coalesce(v_input.candidate_id, '')) = ''
    or btrim(coalesce(v_input.policy_version, '')) = ''
    or btrim(coalesce(v_input.analysis_archetype, '')) = ''
    or btrim(coalesce(v_input.model_version, '')) = ''
    or btrim(coalesce(v_input.recommendation_policy_version, '')) = ''
  then
    raise exception 'CALIBRATION_CANDIDATE_LINEAGE_REQUIRED';
  end if;
  if v_input.stage is distinct from 'CANDIDATE' then
    raise exception 'CALIBRATION_CANDIDATE_STAGE_INVALID';
  end if;
  if v_input.horizon not in ('1d', '7d', '30d', '90d', '180d', '1y') then
    raise exception 'CALIBRATION_CANDIDATE_HORIZON_INVALID';
  end if;
  if v_input.rating not in ('STRONG_BUY', 'BUY', 'WAIT', 'HOLD', 'REDUCE', 'SELL', 'UNAVAILABLE') then
    raise exception 'CALIBRATION_CANDIDATE_RATING_INVALID';
  end if;
  if v_input.created_at is distinct from p_evaluated_at
    or v_input.updated_at is distinct from p_evaluated_at
  then
    raise exception 'CALIBRATION_CANDIDATE_EVALUATION_TIME_MISMATCH';
  end if;
  if v_input.sample_size is null or v_input.sample_size < 0
    or v_input.benchmark_sample_size is null
    or v_input.benchmark_sample_size < 0
    or v_input.benchmark_sample_size > v_input.sample_size
  then
    raise exception 'CALIBRATION_CANDIDATE_SAMPLE_INVALID';
  end if;
  if v_input.hit_rate is not null and (v_input.hit_rate < 0 or v_input.hit_rate > 1) then
    raise exception 'CALIBRATION_CANDIDATE_HIT_RATE_INVALID';
  end if;
  if v_input.reasons is null then
    raise exception 'CALIBRATION_CANDIDATE_REASONS_REQUIRED';
  end if;
  if v_input.backtest_improved is not null
    or v_input.shadow_improved is not null
    or v_input.backtest_evidence_id is not null
    or v_input.shadow_evidence_id is not null
    or v_input.explicit_approval is distinct from false
    or v_input.approved_at is not null
    or v_input.production_at is not null
  then
    raise exception 'CALIBRATION_CANDIDATE_PROMOTION_STATE_NOT_ALLOWED';
  end if;

  -- ON CONFLICT serializes a concurrent first insert on the unique key. The
  -- creation trigger remains authoritative and fires only for the winning row.
  insert into public.analysis_recommendation_v3_calibration_candidates (
    candidate_key,
    candidate_id,
    policy_version,
    created_at,
    stage,
    horizon,
    rating,
    analysis_archetype,
    model_version,
    recommendation_policy_version,
    sample_size,
    benchmark_sample_size,
    hit_rate,
    mean_excess_return,
    median_excess_return,
    reasons,
    backtest_improved,
    shadow_improved,
    backtest_evidence_id,
    shadow_evidence_id,
    explicit_approval,
    approved_at,
    production_at,
    updated_at
  ) values (
    v_input.candidate_key,
    v_input.candidate_id,
    v_input.policy_version,
    v_input.created_at,
    v_input.stage,
    v_input.horizon,
    v_input.rating,
    v_input.analysis_archetype,
    v_input.model_version,
    v_input.recommendation_policy_version,
    v_input.sample_size,
    v_input.benchmark_sample_size,
    v_input.hit_rate,
    v_input.mean_excess_return,
    v_input.median_excess_return,
    v_input.reasons,
    null,
    null,
    null,
    null,
    false,
    null,
    null,
    p_evaluated_at
  )
  on conflict (candidate_key) do nothing
  returning id into v_created_id;

  if v_created_id is not null then
    return query select 'CANDIDATE'::text, true, false;
    return;
  end if;

  select
    c.stage,
    c.updated_at,
    c.policy_version,
    c.horizon,
    c.rating,
    c.analysis_archetype,
    c.model_version,
    c.recommendation_policy_version
  into
    v_stage,
    v_current_updated_at,
    v_policy_version,
    v_horizon,
    v_rating,
    v_analysis_archetype,
    v_model_version,
    v_recommendation_policy_version
  from public.analysis_recommendation_v3_calibration_candidates c
  where c.candidate_key = v_input.candidate_key
  for update;

  if not found then
    raise exception 'CALIBRATION_CANDIDATE_NOT_FOUND_AFTER_CONFLICT';
  end if;

  if v_policy_version is distinct from v_input.policy_version
    or v_horizon is distinct from v_input.horizon
    or v_rating is distinct from v_input.rating
    or v_analysis_archetype is distinct from v_input.analysis_archetype
    or v_model_version is distinct from v_input.model_version
    or v_recommendation_policy_version is distinct from v_input.recommendation_policy_version
  then
    raise exception 'CALIBRATION_CANDIDATE_KEY_LINEAGE_MISMATCH';
  end if;

  if v_stage <> 'CANDIDATE' then
    return query select v_stage, false, false;
    return;
  end if;

  if v_current_updated_at > p_evaluated_at then
    return query select v_stage, false, false;
    return;
  end if;

  update public.analysis_recommendation_v3_calibration_candidates c
  set
    sample_size = v_input.sample_size,
    benchmark_sample_size = v_input.benchmark_sample_size,
    hit_rate = v_input.hit_rate,
    mean_excess_return = v_input.mean_excess_return,
    median_excess_return = v_input.median_excess_return,
    reasons = v_input.reasons,
    updated_at = p_evaluated_at
  where c.candidate_key = v_input.candidate_key
    and c.stage = 'CANDIDATE';

  return query select 'CANDIDATE'::text, false, true;
end;
$$;

revoke all on function public.persist_recommendation_v3_calibration_candidate(jsonb, timestamptz) from public;
revoke all on function public.persist_recommendation_v3_calibration_candidate(jsonb, timestamptz) from anon;
revoke all on function public.persist_recommendation_v3_calibration_candidate(jsonb, timestamptz) from authenticated;
grant execute on function public.persist_recommendation_v3_calibration_candidate(jsonb, timestamptz) to service_role;

comment on function public.persist_recommendation_v3_calibration_candidate(jsonb, timestamptz) is
  'Atomically creates or refreshes objective Recommendation V3 calibration candidates. CANDIDATE refreshes are monotonic by evaluation time; stale overlapping runs are no-ops and advanced stages are immutable through this path.';

commit;
