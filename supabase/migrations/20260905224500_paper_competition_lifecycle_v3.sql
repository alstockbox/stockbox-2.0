begin;

create or replace function public.reconcile_paper_competition_lifecycle_v3()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_activated integer := 0;
begin
  update public.paper_competitions_v3
  set status = 'active',
      updated_at = v_now
  where status = 'open'
    and starts_at <= v_now
    and ends_at >= v_now;

  get diagnostics v_activated = row_count;
  return v_activated;
end;
$$;

revoke all on function public.reconcile_paper_competition_lifecycle_v3() from public, anon, authenticated;
grant execute on function public.reconcile_paper_competition_lifecycle_v3() to service_role;

commit;
