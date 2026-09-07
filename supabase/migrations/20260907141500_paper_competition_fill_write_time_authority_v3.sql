begin;

create or replace function private.enforce_paper_competition_fill_window_v3()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account_type text;
  v_competition_id uuid;
  v_competition public.paper_competitions_v3%rowtype;
  v_now timestamptz;
begin
  select account_type, competition_id
    into v_account_type, v_competition_id
  from public.paper_accounts_v3
  where id = new.account_id
    and user_id = new.user_id;

  if not found then
    raise exception 'paper competition fill account unavailable';
  end if;

  if v_account_type <> 'competition' then
    return new;
  end if;

  select *
    into v_competition
  from public.paper_competitions_v3
  where id = v_competition_id
  for update;

  if not found then
    raise exception 'paper competition fill competition unavailable';
  end if;

  -- Refresh the database wall clock after any row-lock wait. This closes the
  -- gap where an order is accepted before ends_at, waits on Yahoo/provider
  -- work, and would otherwise persist after the official competition cutoff.
  v_now := clock_timestamp();

  if v_competition.status <> 'active'
    or v_now < v_competition.starts_at
    or v_now > v_competition.ends_at
    or new.executed_at < v_competition.starts_at
    or new.executed_at > v_competition.ends_at
    or new.market_observed_at < v_competition.starts_at
    or new.market_observed_at > v_competition.ends_at
  then
    raise exception 'paper competition fill outside official window';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_paper_competition_fill_window_v3() from public, anon, authenticated;

commit;
