begin;

create or replace function public.join_paper_competition_v3(
  p_user_id uuid,
  p_competition_id uuid
)
returns public.paper_competition_entries_v3
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_competition public.paper_competitions_v3;
  v_entry public.paper_competition_entries_v3;
  v_account public.paper_accounts_v3;
  v_participant_count integer;
begin
  if p_user_id is null or p_competition_id is null then
    raise exception 'paper competition identity required';
  end if;

  select * into v_competition
  from public.paper_competitions_v3
  where id = p_competition_id
  for update;

  if not found then
    raise exception 'paper competition unavailable';
  end if;

  if v_competition.kind <> 'challenge' then
    raise exception 'paper competition requires private league invite';
  end if;

  select * into v_entry
  from public.paper_competition_entries_v3
  where competition_id = p_competition_id
    and user_id = p_user_id;

  if found then
    return v_entry;
  end if;

  if v_competition.status <> 'open'
    or pg_catalog.now() > v_competition.join_deadline
    or pg_catalog.now() >= v_competition.starts_at
  then
    raise exception 'paper competition is not open for joining';
  end if;

  select count(*)::integer into v_participant_count
  from public.paper_competition_entries_v3
  where competition_id = p_competition_id;

  if v_participant_count >= v_competition.max_participants then
    raise exception 'paper competition participant limit reached';
  end if;

  insert into public.paper_accounts_v3 (
    user_id,
    name,
    base_currency,
    starting_cash,
    account_type,
    competition_id
  ) values (
    p_user_id,
    pg_catalog.left('Competition · ' || v_competition.name, 80),
    v_competition.base_currency,
    100000,
    'competition',
    v_competition.id
  )
  returning * into v_account;

  insert into public.paper_cash_balances_v3 (
    account_id,
    user_id,
    currency,
    amount
  ) values (
    v_account.id,
    p_user_id,
    v_competition.base_currency,
    100000
  );

  insert into public.paper_competition_entries_v3 (
    competition_id,
    user_id,
    account_id
  ) values (
    v_competition.id,
    p_user_id,
    v_account.id
  )
  returning * into v_entry;

  return v_entry;
end;
$$;

revoke all on function public.join_paper_competition_v3(uuid,uuid) from public, anon, authenticated;
grant execute on function public.join_paper_competition_v3(uuid,uuid) to service_role;

commit;
