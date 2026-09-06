begin;

create or replace function public.complete_due_paper_competitions_v3()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_completed integer := 0;
begin
  update public.paper_competitions_v3
  set status = 'completed',
      updated_at = v_now
  where status = 'active'
    and ends_at < v_now;

  get diagnostics v_completed = row_count;
  return v_completed;
end;
$$;

revoke all on function public.complete_due_paper_competitions_v3() from public, anon, authenticated;
grant execute on function public.complete_due_paper_competitions_v3() to service_role;

commit;
