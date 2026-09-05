import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260905223400_paper_performance_snapshots_v3.sql",
  "utf8",
);

describe("Paper Trading V3 performance snapshot persistence", () => {
  it("stores only the fixed-capital verified mark-to-market policy", () => {
    expect(migration).toContain("starting_cash = 100000");
    expect(migration).toContain("stockbox-paper-performance-v3.0.0");
    expect(migration).toContain("VERIFIED_MARK_TO_MARKET");
    expect(migration).toContain("quote_count = open_position_count");
    expect(migration).toContain("equity = cash_value + positions_market_value");
    expect(migration).toContain("profit_loss = equity - starting_cash");
    expect(migration).toContain("return_percent = (profit_loss / starting_cash) * 100");
  });

  it("fails closed on incomplete or stale quote coverage", () => {
    expect(migration).toContain("paper snapshot quote coverage incomplete");
    expect(migration).toContain("paper snapshot quote timestamp required");
    expect(migration).toContain("paper snapshot quote is stale");
    expect(migration).toContain("interval '20 minutes'");
  });

  it("binds snapshots to an active owner account and its stored currency/capital", () => {
    expect(migration).toContain("foreign key (account_id, user_id)");
    expect(migration).toContain("references public.paper_accounts_v3(id, user_id)");
    expect(migration).toContain("and user_id = p_user_id");
    expect(migration).toContain("and status = 'active'");
    expect(migration).toContain("paper snapshot currency mismatch");
    expect(migration).toContain("paper snapshot starting capital invariant failed");
  });

  it("lets authenticated users read only their own snapshots and never write them directly", () => {
    expect(migration).toContain('create policy "paper performance snapshots v3 select own"');
    expect(migration).toContain("for select to authenticated");
    expect(migration).toContain("using ((select auth.uid()) = user_id)");
    expect(migration).toContain(
      "revoke all on table public.paper_performance_snapshots_v3 from public, anon, authenticated",
    );
    expect(migration).toContain("grant select on table public.paper_performance_snapshots_v3 to authenticated");
    expect(migration).not.toContain("grant insert on table public.paper_performance_snapshots_v3 to authenticated");
    expect(migration).not.toContain("grant update on table public.paper_performance_snapshots_v3 to authenticated");
    expect(migration).not.toContain("grant delete on table public.paper_performance_snapshots_v3 to authenticated");
  });

  it("keeps snapshot creation service-role only", () => {
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = ''");
    expect(migration).toContain(
      "revoke all on function public.record_paper_performance_snapshot_v3(uuid,uuid,text,numeric,numeric,integer,integer,timestamptz,timestamptz) from public, anon, authenticated",
    );
    expect(migration).toContain(
      "grant execute on function public.record_paper_performance_snapshot_v3(uuid,uuid,text,numeric,numeric,integer,integer,timestamptz,timestamptz) to service_role",
    );
  });

  it("is immutable and rejects conflicting idempotent retries", () => {
    expect(migration).toContain("unique (account_id, evaluated_at, policy_version)");
    expect(migration).toContain("on conflict (account_id, evaluated_at, policy_version) do nothing");
    expect(migration).toContain("paper snapshot idempotency conflict");
    expect(migration).not.toContain("do update set");
  });

  it("does not expose a public leaderboard projection", () => {
    expect(migration).not.toContain("grant select on table public.paper_performance_snapshots_v3 to anon");
    expect(migration).not.toContain("create view public.paper_leaderboard");
    expect(migration).not.toContain("user_email");
  });
});