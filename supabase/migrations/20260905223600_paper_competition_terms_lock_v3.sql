begin;

create or replace function private.enforce_paper_competition_terms_lock_v3()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.paper_competition_entries_v3
    where competition_id = old.id
    limit 1
  ) and (
    old.kind is distinct from new.kind
    or old.base_currency is distinct from new.base_currency
    or old.starting_cash is distinct from new.starting_cash
    or old.starts_at is distinct from new.starts_at
    or old.join_deadline is distinct from new.join_deadline
    or old.ends_at is distinct from new.ends_at
    or old.max_participants is distinct from new.max_participants
  ) then
    raise exception 'paper competition fairness terms are immutable after first entry';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_paper_competition_terms_lock_v3() from public, anon, authenticated;

drop trigger if exists paper_competition_terms_lock_v3 on public.paper_competitions_v3;
create trigger paper_competition_terms_lock_v3
before update on public.paper_competitions_v3
for each row execute function private.enforce_paper_competition_terms_lock_v3();

commit;