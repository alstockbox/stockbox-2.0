begin;

update public.company_latest_metrics
set normalized = normalized - 'analysisId' - 'personalizedScore' - 'sourceMeta'
where normalized ?| array['analysisId', 'personalizedScore', 'sourceMeta'];

commit;
