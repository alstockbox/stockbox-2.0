begin;

create or replace function public.list_due_paper_competition_final_valuations_v3()
returns table (
  competition_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
begin
  return query
  select c.id
  from public.paper_competitions_v3 c
  left join public.paper_competition_valuation_control_v3 control
    on control.competition_id = c.id
  where c.status = 'completed'
    and c.kind in ('challenge', 'private_league')
    and v_now > c.ends_at
    and control.last_verified_evaluation_cutoff is distinct from c.ends_at
    and (control.lease_expires_at is null or control.lease_expires_at <= v_now)
    and (
      control.last_evaluation_cutoff is distinct from c.ends_at
      or control.last_completed_at is null
      or control.last_completed_at <= v_now - interval '15 minutes'
    )
  order by
    case when control.last_evaluation_cutoff is distinct from c.ends_at then 0 else 1 end asc,
    control.last_completed_at asc nulls first,
    c.ends_at asc,
    c.id asc
  limit 8;
end;
$$;

revoke all on function public.list_due_paper_competition_final_valuations_v3() from public, anon, authenticated;
grant execute on function public.list_due_paper_competition_final_valuations_v3() to service_role;

commit;
