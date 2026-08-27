alter table public.analysis_batch_qa_results
  add column if not exists score numeric(7,3),
  add column if not exists rating text not null default 'No Rating',
  add column if not exists score_policy_version text not null default 'legacy-unknown',
  add column if not exists benchmark_version text not null default 'legacy-unknown',
  add column if not exists canonical_input_fingerprint text;

create index if not exists analysis_batch_qa_results_fingerprint_idx
  on public.analysis_batch_qa_results (canonical_input_fingerprint)
  where canonical_input_fingerprint is not null;
