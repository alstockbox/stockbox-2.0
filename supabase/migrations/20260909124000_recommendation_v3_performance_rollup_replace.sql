begin;

create or replace function public.replace_recommendation_v3_performance_rollups(
  p_rows jsonb,
  p_outcome_policy_version text,
  p_benchmark_policy_version text,
  p_source_limit integer,
  p_dimension_sample_gate integer,
  p_evaluated_at timestamptz
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rows jsonb := coalesce(p_rows, '[]'::jsonb);
  v_persisted integer := 0;
begin
  if jsonb_typeof(v_rows) <> 'array' then
    raise exception 'RECOMMENDATION_PERFORMANCE_ROLLUPS_ROWS_MUST_BE_ARRAY';
  end if;
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
  if p_evaluated_at is null then
    raise exception 'RECOMMENDATION_PERFORMANCE_ROLLUP_EVALUATED_AT_REQUIRED';
  end if;

  -- Reject a payload whose embedded lineage differs from the replacement key.
  -- This is checked before deletion; any later failure also rolls back the whole
  -- function call because PostgreSQL executes it in the caller transaction.
  if exists (
    select 1
    from jsonb_populate_recordset(
      null::public.analysis_recommendation_v3_performance_rollups,
      v_rows
    ) as r
    where r.outcome_policy_version is distinct from p_outcome_policy_version
      or r.benchmark_policy_version is distinct from p_benchmark_policy_version
      or r.source_limit is distinct from p_source_limit
      or r.dimension_sample_gate is distinct from p_dimension_sample_gate
      or r.evaluated_at is distinct from p_evaluated_at
      or r.updated_at is distinct from p_evaluated_at
  ) then
    raise exception 'RECOMMENDATION_PERFORMANCE_ROLLUP_REPLACEMENT_LINEAGE_MISMATCH';
  end if;

  delete from public.analysis_recommendation_v3_performance_rollups
  where outcome_policy_version = p_outcome_policy_version
    and benchmark_policy_version = p_benchmark_policy_version
    and source_limit = p_source_limit
    and dimension_sample_gate = p_dimension_sample_gate;

  insert into public.analysis_recommendation_v3_performance_rollups (
    scope,
    horizon,
    rating,
    sector,
    analysis_archetype,
    model_version,
    recommendation_policy_version,
    outcome_policy_version,
    benchmark_policy_version,
    source_limit,
    dimension_sample_gate,
    sample_count,
    benchmark_count,
    directional_count,
    hit_rate,
    mean_security_return,
    mean_excess_return,
    median_excess_return,
    evaluated_at,
    updated_at
  )
  select
    r.scope,
    r.horizon,
    r.rating,
    r.sector,
    r.analysis_archetype,
    r.model_version,
    r.recommendation_policy_version,
    r.outcome_policy_version,
    r.benchmark_policy_version,
    r.source_limit,
    r.dimension_sample_gate,
    r.sample_count,
    r.benchmark_count,
    r.directional_count,
    r.hit_rate,
    r.mean_security_return,
    r.mean_excess_return,
    r.median_excess_return,
    r.evaluated_at,
    r.updated_at
  from jsonb_populate_recordset(
    null::public.analysis_recommendation_v3_performance_rollups,
    v_rows
  ) as r;

  get diagnostics v_persisted = row_count;
  return v_persisted;
end;
$$;

revoke all on function public.replace_recommendation_v3_performance_rollups(
  jsonb, text, text, integer, integer, timestamptz
) from public;
revoke all on function public.replace_recommendation_v3_performance_rollups(
  jsonb, text, text, integer, integer, timestamptz
) from anon;
revoke all on function public.replace_recommendation_v3_performance_rollups(
  jsonb, text, text, integer, integer, timestamptz
) from authenticated;
grant execute on function public.replace_recommendation_v3_performance_rollups(
  jsonb, text, text, integer, integer, timestamptz
) to service_role;

comment on function public.replace_recommendation_v3_performance_rollups(
  jsonb, text, text, integer, integer, timestamptz
) is
  'Atomically replaces one complete private Recommendation V3 performance rollup snapshot for an exact policy/window/sample-gate lineage. Raw objective outcomes remain source of truth.';

commit;
