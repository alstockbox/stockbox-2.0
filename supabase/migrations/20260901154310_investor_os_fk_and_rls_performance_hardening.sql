begin;

create index if not exists analysis_change_events_previous_analysis_idx
  on public.analysis_change_events (previous_analysis_id);
create index if not exists batch_items_analysis_idx
  on public.batch_items (analysis_id);
create index if not exists investment_theses_last_analysis_idx
  on public.investment_theses (last_analysis_id);
create index if not exists monitoring_events_watchlist_idx
  on public.monitoring_events (watchlist_id);
create index if not exists monitoring_snapshots_user_idx
  on public.monitoring_snapshots (user_id);
create index if not exists thesis_evidence_events_analysis_idx
  on public.thesis_evidence_events (analysis_id);

drop policy if exists monitoring_snapshots_select_own on public.monitoring_snapshots;
create policy monitoring_snapshots_select_own on public.monitoring_snapshots
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists monitoring_events_select_own on public.monitoring_events;
create policy monitoring_events_select_own on public.monitoring_events
  for select to authenticated using ((select auth.uid()) = user_id);

commit;
