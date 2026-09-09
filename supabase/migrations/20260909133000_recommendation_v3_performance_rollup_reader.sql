begin;

create or replace function public.read_recommendation_v3_performance_rollup_snapshot(
  p_outcome_policy_version text,
  p_benchmark_policy_version text,
  p_source_limit integer,
  p_dimension_sample_gate integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_latest_evaluated_at timestamptz;
  v_rollups jsonb := '[]'::jsonb;
begin
  if p_outcome_policy_version is null or btrim(p_outcome_policy_version) = '' then
    raise exception 'RECOMMENDATION_PERFORMANCE_ROLLUP_OUTCOME_POLICY_REQUIRED';
  end if;
  if p_benchmark_policy_version is null or btrim(p_benchmark_policy_version) = '' then
    raise exception 'RECOMMENDATION_PERFORMANCE_ROLLUP_BENCHMARK_POLICY_REQUIRED';
  end if;
  if p_source_limit is null or p_source_limit < 30 or p_source_limit > 20000 then
    raise exception 'RECOMMENDATION_PERFORMANCE_ROLLUP_SOURCE_LIMIT_INVALID';
  end if;
  if p_dimension_sample_gate is null or p_dimension_sample_gate < 20 then
    raise exception 'RECOMMENDATION_PERFORMANCE_ROLLUP_SAMPLE_GATE_INVALID';
  end if;

  -- Writer replacements take FOR UPDATE on the same lineage row. FOR SHARE
  -- freezes that watermark until this function returns, preventing a concurrent
  -- replace between the watermark read and the rollup read under READ COMMITTED.
  select w.latest_evaluated_at
  into v_latest_evaluated_at
  from public.analysis_recommendation_v3_performance_rollup_watermarks w
  where w.outcome_policy_version = p_outcome_policy_version
    and w.benchmark_policy_version = p_benchmark_policy_version
    and w.source_limit = p_source_limit
    and w.dimension_sample_gate = p_dimension_sample_gate
  for share;

  if not found then
    return jsonb_build_object(
      'snapshot_evaluated_at', null,
      'outcome_policy_version', p_outcome_policy_version,
      'benchmark_policy_version', p_benchmark_policy_version,
      'source_limit', p_source_limit,
      'dimension_sample_gate', p_dimension_sample_gate,
      'rollups', '[]'::jsonb
    );
  end if;

  select coalesce(
    jsonb_agg(
      to_jsonb(r)
      order by
        r.scope,
        r.horizon,
        r.rating,
        coalesce(r.sector, ''),
        coalesce(r.analysis_archetype, ''),
        coalesce(r.model_version, ''),
        coalesce(r.recommendation_policy_version, '')
    ),
    '[]'::jsonb
  )
  into v_rollups
  from public.analysis_recommendation_v3_performance_rollups r
  where r.outcome_policy_version = p_outcome_policy_version
    and r.benchmark_policy_version = p_benchmark_policy_version
    and r.source_limit = p_source_limit
    and r.dimension_sample_gate = p_dimension_sample_gate
    and r.evaluated_at = v_latest_evaluated_at;

  return jsonb_build_object(
    'snapshot_evaluated_at', v_latest_evaluated_at,
    'outcome_policy_version', p_outcome_policy_version,
    'benchmark_policy_version', p_benchmark_policy_version,
    'source_limit', p_source_limit,
    'dimension_sample_gate', p_dimension_sample_gate,
    'rollups', v_rollups
  );
end;
$$;

revoke all on function public.read_recommendation_v3_performance_rollup_snapshot(
  text, text, integer, integer
) from public;
revoke all on function public.read_recommendation_v3_performance_rollup_snapshot(
  text, text, integer, integer
) from anon;
revoke all on function public.read_recommendation_v3_performance_rollup_snapshot(
  text, text, integer, integer
) from authenticated;
grant execute on function public.read_recommendation_v3_performance_rollup_snapshot(
  text, text, integer, integer
) to service_role;

comment on function public.read_recommendation_v3_performance_rollup_snapshot(
  text, text, integer, integer
) is
  'Reads one private Recommendation V3 performance snapshot while holding a shared lock on its durable lineage watermark so rows and watermark cannot come from different replacements.';

commit;
