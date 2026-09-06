begin;

create or replace function public.list_due_paper_competition_valuations_v3()
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
  with due as (
    select
      c.id as candidate_id,
      c.kind,
      c.starts_at,
      control.last_claimed_at,
      row_number() over (
        partition by c.kind
        order by control.last_claimed_at asc nulls first, c.starts_at asc, c.id asc
      ) as kind_rank
    from public.paper_competitions_v3 c
    left join public.paper_competition_valuation_control_v3 control
      on control.competition_id = c.id
    where c.status = 'active'
      and c.kind in ('challenge', 'private_league')
      and v_now >= c.starts_at
      and v_now <= c.ends_at
      and (control.lease_expires_at is null or control.lease_expires_at <= v_now)
      and (control.last_claimed_at is null or control.last_claimed_at <= v_now - interval '15 minutes')
  ), bounded as (
    select
      candidate_id,
      kind,
      starts_at,
      last_claimed_at,
      kind_rank
    from due
    order by
      kind_rank asc,
      kind asc,
      last_claimed_at asc nulls first,
      starts_at asc,
      candidate_id asc
    limit 8
  )
  select b.candidate_id
  from bounded b
  order by
    b.kind_rank asc,
    b.kind asc,
    b.last_claimed_at asc nulls first,
    b.starts_at asc,
    b.candidate_id asc;
end;
$$;

revoke all on function public.list_due_paper_competition_valuations_v3() from public, anon, authenticated;
grant execute on function public.list_due_paper_competition_valuations_v3() to service_role;

commit;
