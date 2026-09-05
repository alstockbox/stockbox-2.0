begin;

alter table public.paper_orders_v3
  add constraint paper_orders_v3_id_account_user_key unique (id, account_id, user_id);

alter table public.paper_fills_v3
  add constraint paper_fills_v3_order_account_user_fk
  foreign key (order_id, account_id, user_id)
  references public.paper_orders_v3(id, account_id, user_id)
  on delete restrict;

create schema if not exists private;

create or replace function private.enforce_paper_fill_integrity_v3()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.paper_orders_v3;
  v_min_running_quantity numeric;
begin
  select * into v_order
  from public.paper_orders_v3
  where id = new.order_id;

  if not found then
    raise exception 'paper fill requires an existing order';
  end if;

  if v_order.status <> 'filled'
    or v_order.account_id <> new.account_id
    or v_order.user_id <> new.user_id
    or v_order.ticker <> new.ticker
    or v_order.side <> new.side
    or abs(v_order.quantity - new.quantity) > 0.000000001
  then
    raise exception 'paper fill does not match its order';
  end if;

  select min(running_quantity)
    into v_min_running_quantity
  from (
    select sum(delta) over (
      order by executed_at, fill_id
      rows between unbounded preceding and current row
    ) as running_quantity
    from (
      select
        executed_at,
        id as fill_id,
        case when side = 'buy' then quantity else -quantity end as delta
      from public.paper_fills_v3
      where account_id = new.account_id
        and user_id = new.user_id
        and ticker = new.ticker
        and currency = new.currency

      union all

      select
        new.executed_at,
        new.id,
        case when new.side = 'buy' then new.quantity else -new.quantity end
    ) events
  ) ledger;

  if coalesce(v_min_running_quantity, 0) < -0.000000001 then
    raise exception 'paper fill would create a short or historical oversell';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_paper_fill_integrity_v3() from public, anon, authenticated;

drop trigger if exists paper_fills_v3_integrity_guard on public.paper_fills_v3;
create trigger paper_fills_v3_integrity_guard
before insert or update on public.paper_fills_v3
for each row execute function private.enforce_paper_fill_integrity_v3();

commit;
