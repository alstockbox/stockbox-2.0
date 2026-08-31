begin;

alter table public.company_latest_metrics
  drop column if exists analysis_id;

commit;
