begin;

alter table public.analysis_recommendation_v3_outcomes
  add column if not exists benchmark_policy_version text;

-- Existing rows predate durable benchmark-assignment lineage. Do not backfill
-- them with today's policy: that would fabricate provenance. NOT VALID keeps
-- those legacy rows readable while enforcing lineage for every future insert or
-- update, including intentionally unbenchmarked ETF outcomes.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'analysis_recommendation_v3_outcomes_benchmark_policy_required'
      and conrelid = 'public.analysis_recommendation_v3_outcomes'::regclass
  ) then
    alter table public.analysis_recommendation_v3_outcomes
      add constraint analysis_recommendation_v3_outcomes_benchmark_policy_required
      check (benchmark_policy_version is not null) not valid;
  end if;
end
$$;

comment on column public.analysis_recommendation_v3_outcomes.benchmark_policy_version is
  'Version of the policy that decided whether and how benchmark-relative outcome evidence was permitted. Legacy null means lineage was not durably recorded and benchmark-relative fields must not be used for calibration.';

commit;
