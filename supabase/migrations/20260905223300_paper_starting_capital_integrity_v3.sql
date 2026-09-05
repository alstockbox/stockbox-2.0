begin;

alter table public.paper_accounts_v3
  add column if not exists starting_cash numeric(30,10);

update public.paper_accounts_v3
set starting_cash = 100000
where starting_cash is null;

alter table public.paper_accounts_v3
  alter column starting_cash set default 100000,
  alter column starting_cash set not null;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conname = 'paper_accounts_v3_starting_cash_fixed'
      and conrelid = 'public.paper_accounts_v3'::regclass
  ) then
    alter table public.paper_accounts_v3
      add constraint paper_accounts_v3_starting_cash_fixed
      check (starting_cash = 100000);
  end if;
end;
$$;

create or replace function public.create_paper_account_v3(
  p_user_id uuid,
  p_name text,
  p_base_currency text,
  p_starting_cash numeric
)
returns public.paper_accounts_v3
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account public.paper_accounts_v3;
  v_name text := trim(p_name);
  v_currency text := upper(trim(p_base_currency));
  v_account_count integer;
begin
  if p_user_id is null then raise exception 'user id required'; end if;
  if v_name is null or char_length(v_name) < 1 or char_length(v_name) > 80 then
    raise exception 'invalid account name';
  end if;
  if v_currency is null or v_currency !~ '^[A-Z]{3}$' then
    raise exception 'invalid base currency';
  end if;
  if p_starting_cash is null or p_starting_cash <> 100000 then
    raise exception 'paper starting cash must equal 100000';
  end if;

  -- Serialize account creation per user so concurrent requests cannot race
  -- past either the account cap or the fixed-capital competition invariant.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_user_id::text));

  select count(*)::integer into v_account_count
  from public.paper_accounts_v3
  where user_id = p_user_id;

  if v_account_count >= 20 then
    raise exception 'paper account limit reached';
  end if;

  insert into public.paper_accounts_v3 (user_id, name, base_currency, starting_cash)
  values (p_user_id, v_name, v_currency, 100000)
  returning * into v_account;

  insert into public.paper_cash_balances_v3 (account_id, user_id, currency, amount)
  values (v_account.id, p_user_id, v_currency, 100000);

  return v_account;
end;
$$;

revoke all on function public.create_paper_account_v3(uuid,text,text,numeric) from public, anon, authenticated;
grant execute on function public.create_paper_account_v3(uuid,text,text,numeric) to service_role;

commit;