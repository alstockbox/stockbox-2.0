begin;

create or replace function private.enforce_paper_competition_snapshot_window_v3()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account_type text;
  v_competition_id uuid;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
begin
  select account_type, competition_id
    into v_account_type, v_competition_id
  from public.paper_accounts_v3
  where id = new.account_id
    and user_id = new.user_id;

  if not found then
    raise exception 'paper competition snapshot account unavailable';
  end if;

  if v_account_type <> 'competition' then
    return new;
  end if;

  select starts_at, ends_at
    into v_starts_at, v_ends_at
  from public.paper_competitions_v3
  where id = v_competition_id;

  if not found then
    raise exception 'paper competition snapshot competition unavailable';
  end if;

  if new.evaluated_at < v_starts_at
    or new.evaluated_at > v_ends_at
  then
    raise exception 'paper competition snapshot outside official window';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_paper_competition_snapshot_window_v3() from public, anon, authenticated;

drop trigger if exists paper_competition_snapshot_window_v3 on public.paper_performance_snapshots_v3;
create trigger paper_competition_snapshot_window_v3
before insert or update on public.paper_performance_snapshots_v3
for each row execute function private.enforce_paper_competition_snapshot_window_v3();

commit;
