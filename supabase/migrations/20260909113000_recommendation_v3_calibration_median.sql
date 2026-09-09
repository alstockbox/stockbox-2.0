begin;

alter table public.analysis_recommendation_v3_calibration_candidates
  add column if not exists median_excess_return numeric;

comment on column public.analysis_recommendation_v3_calibration_candidates.median_excess_return is
  'Median benchmark-relative return for the candidate slice. Null means benchmark-relative median evidence is unavailable; missing data is never coerced to zero.';

commit;
