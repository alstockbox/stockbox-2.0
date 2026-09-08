begin;

create or replace function public.record_recommendation_v3_calibration_candidate_creation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.analysis_recommendation_v3_calibration_events (
    candidate_id,
    from_stage,
    to_stage,
    backtest_improved,
    shadow_improved,
    explicit_approval,
    reason,
    occurred_at
  ) values (
    new.id,
    null,
    'CANDIDATE',
    new.backtest_improved,
    new.shadow_improved,
    new.explicit_approval,
    'CALIBRATION_DRIFT_CANDIDATE_CREATED',
    new.created_at
  );
  return new;
end;
$$;

drop trigger if exists recommendation_v3_calibration_candidate_creation_event
  on public.analysis_recommendation_v3_calibration_candidates;
create trigger recommendation_v3_calibration_candidate_creation_event
after insert on public.analysis_recommendation_v3_calibration_candidates
for each row execute function public.record_recommendation_v3_calibration_candidate_creation();

revoke all on function public.record_recommendation_v3_calibration_candidate_creation() from public;
revoke all on function public.record_recommendation_v3_calibration_candidate_creation() from anon;
revoke all on function public.record_recommendation_v3_calibration_candidate_creation() from authenticated;

comment on function public.record_recommendation_v3_calibration_candidate_creation() is
  'Writes the immutable CANDIDATE creation event in the same transaction as a StockBox 3.0 calibration candidate insert.';

commit;
