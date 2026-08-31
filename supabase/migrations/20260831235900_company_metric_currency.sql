begin;

alter table public.company_latest_metrics
  add column if not exists currency text;

create index if not exists company_latest_metrics_currency_idx
  on public.company_latest_metrics (currency);

commit;
