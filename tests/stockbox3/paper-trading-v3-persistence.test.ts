import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const core = readFileSync("supabase/migrations/20260905223000_paper_trading_v3_core.sql", "utf8");
const integrity = readFileSync("supabase/migrations/20260905223100_paper_trading_v3_fill_integrity.sql", "utf8");
const sql = `${core}\n${integrity}`;

describe("Paper Trading V3 persistence", () => {
  it("creates account, cash, order and immutable-fill source tables with RLS", () => {
    for (const table of ["paper_accounts_v3", "paper_cash_balances_v3", "paper_orders_v3", "paper_fills_v3"]) {
      expect(sql).toContain(`create table if not exists public.${table}`);
      expect(sql).toContain(`alter table public.${table} enable row level security;`);
    }
    expect(sql).not.toContain("paper_positions_v3");
  });

  it("lets authenticated users read only their own simulator facts and forbids client writes", () => {
    for (const table of ["paper_accounts_v3", "paper_cash_balances_v3", "paper_orders_v3", "paper_fills_v3"]) {
      expect(core).toContain(`revoke all on table public.${table} from public, anon, authenticated;`);
      expect(core).toContain(`grant select on table public.${table} to authenticated;`);
    }
    expect(core.match(/using \(\(select auth\.uid\(\)\) = user_id\);/g)?.length).toBe(4);
  });

  it("makes account idempotency unique and records rejected attempts as terminal order facts", () => {
    expect(core).toContain("unique (account_id, idempotency_key)");
    expect(core).toContain("if found then return v_order; end if;");
    expect(core).toContain("'rejected', p_rejection_reason");
    expect(core).toContain("raise exception 'idempotency key already rejected'");
  });

  it("keeps all write RPCs service-role-only with empty search paths", () => {
    for (const fn of ["create_paper_account_v3", "record_paper_rejection_v3", "record_paper_fill_v3"]) {
      expect(core).toContain(`create or replace function public.${fn}`);
    }
    expect(core.match(/security definer\nset search_path = ''/g)?.length).toBe(3);
    expect(core).toContain("grant execute on function public.create_paper_account_v3(uuid,text,text,numeric) to service_role;");
    expect(core).toContain("grant execute on function public.record_paper_rejection_v3(uuid,uuid,text,text,text,numeric,text,timestamptz) to service_role;");
    expect(core).toContain("grant execute on function public.record_paper_fill_v3(uuid,uuid,text,text,text,numeric,numeric,text,timestamptz,text,text,timestamptz) to service_role;");
    expect(core).toContain("from public, anon, authenticated;");
  });

  it("serializes account writes and rechecks same-currency cash and long-only position inside the database", () => {
    expect(core).toContain("pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_account_id::text))");
    expect(core).toContain("where account_id = p_account_id and user_id = p_user_id and currency = v_currency\n    for update;");
    expect(core).toContain("raise exception 'insufficient paper cash'");
    expect(core).toContain("sum(case when side = 'buy' then quantity else -quantity end)");
    expect(core).toContain("and ticker = v_ticker\n      and currency = v_currency;");
    expect(core).toContain("raise exception 'insufficient paper position'");
    expect(core).not.toContain("exchange_rate");
    expect(core).not.toContain("fx_rate");
  });

  it("accepts only verified, fresh, exact-observation fills and calculates gross amount in SQL", () => {
    expect(core).toContain("gross_amount numeric(30,10) generated always as (quantity * price) stored");
    expect(core).toContain("market_verification = 'VERIFIED'");
    expect(core).toContain("pricing_basis = 'VERIFIED_OBSERVATION_EXACT'");
    expect(core).toContain("p_market_verification is distinct from 'VERIFIED'");
    expect(core).toContain("p_market_observed_at > p_executed_at + interval '30 seconds'");
    expect(core).toContain("p_executed_at - p_market_observed_at > interval '20 minutes'");
    expect(core).toContain("v_fee numeric := 0;");
    expect(core).toContain("check (fee = 0)");
  });

  it("binds each fill to the same account/user/order and rejects historical oversells", () => {
    expect(integrity).toContain("unique (id, account_id, user_id)");
    expect(integrity).toContain("foreign key (order_id, account_id, user_id)");
    expect(integrity).toContain("v_order.account_id <> new.account_id");
    expect(integrity).toContain("v_order.user_id <> new.user_id");
    expect(integrity).toContain("v_order.ticker <> new.ticker");
    expect(integrity).toContain("v_order.side <> new.side");
    expect(integrity).toContain("sum(delta) over");
    expect(integrity).toContain("order by executed_at, fill_id");
    expect(integrity).toContain("paper fill would create a short or historical oversell");
    expect(integrity).toContain("before insert or update on public.paper_fills_v3");
  });

  it("does not expose a broker or real-trade execution surface", () => {
    const lower = sql.toLowerCase();
    for (const forbidden of ["alpaca", "interactive brokers", "broker_order", "real_order", "live_trade", "live_order"]) {
      expect(lower).not.toContain(forbidden);
    }
  });
});
