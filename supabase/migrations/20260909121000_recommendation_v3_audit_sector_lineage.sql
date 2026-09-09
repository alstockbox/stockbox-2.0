begin;

alter table public.analysis_recommendation_v3_audit
  add column if not exists sector text;

-- Sector is objective metadata only when supplied by the canonical analysis.
-- Do not backfill legacy audits or infer it from ticker/exchange/archetype.
alter table public.analysis_recommendation_v3_audit
  drop constraint if exists analysis_recommendation_v3_audit_sector_nonblank;
alter table public.analysis_recommendation_v3_audit
  add constraint analysis_recommendation_v3_audit_sector_nonblank
  check (sector is null or btrim(sector) <> '') not valid;

comment on column public.analysis_recommendation_v3_audit.sector is
  'Nullable objective sector lineage from the canonical analysis input/report. Legacy or unavailable sector remains NULL; never infer or backfill.';

commit;
