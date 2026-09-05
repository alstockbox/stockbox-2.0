import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  mapPaperPerformanceSnapshotV3,
  toPaperPerformanceSnapshotRpcParamsV3,
} from "@/lib/paper-trading/performance-repository-v3";
import {
  PAPER_PERFORMANCE_V3_POLICY_VERSION,
  type PaperPerformanceResultV3,
} from "@/lib/paper-trading/performance-v3";

const repositorySource = readFileSync("src/lib/paper-trading/performance-repository-v3.ts", "utf8");

const performance: Extract<PaperPerformanceResultV3, { status: "VERIFIED" }> = {
  status: "VERIFIED",
  rankEligible: true,
  policyVersion: PAPER_PERFORMANCE_V3_POLICY_VERSION,
  pricingBasis: "VERIFIED_MARK_TO_MARKET",
  baseCurrency: "USD",
  startingCash: 100_000,
  cashValue: 99_000,
  positionsMarketValue: 1_100,
  equity: 100_100,
  profitLoss: 100,
  returnPercent: 0.1,
  openPositionCount: 1,
  quoteCount: 1,
  evaluatedAt: "2026-09-05T20:10:00.000Z",
  oldestQuoteObservedAt: "2026-09-05T20:09:00.000Z",
};

function storedRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "snapshot-1",
    account_id: "account-1",
    user_id: "user-1",
    base_currency: "USD",
    starting_cash: "100000.0000000000",
    cash_value: "99000.0000000000",
    positions_market_value: "1100.0000000000",
    equity: "100100.0000000000",
    profit_loss: "100.0000000000",
    return_percent: "0.1000000000",
    open_position_count: 1,
    quote_count: 1,
    evaluated_at: "2026-09-05T20:10:00.000Z",
    oldest_quote_observed_at: "2026-09-05T20:09:00.000Z",
    policy_version: PAPER_PERFORMANCE_V3_POLICY_VERSION,
    pricing_basis: "VERIFIED_MARK_TO_MARKET",
    created_at: "2026-09-05T20:10:01.000Z",
    ...overrides,
  };
}

describe("Paper Trading V3 performance snapshot repository", () => {
  it("creates RPC parameters only from verified rank-eligible performance", () => {
    expect(toPaperPerformanceSnapshotRpcParamsV3({
      userId: " user-1 ",
      accountId: " account-1 ",
      performance,
    })).toEqual({
      p_user_id: "user-1",
      p_account_id: "account-1",
      p_base_currency: "USD",
      p_cash_value: 99_000,
      p_positions_market_value: 1_100,
      p_open_position_count: 1,
      p_quote_count: 1,
      p_evaluated_at: "2026-09-05T20:10:00.000Z",
      p_oldest_quote_observed_at: "2026-09-05T20:09:00.000Z",
    });
  });

  it("never creates snapshot RPC parameters from unavailable performance", () => {
    const unavailable: PaperPerformanceResultV3 = {
      status: "UNAVAILABLE",
      rankEligible: false,
      policyVersion: PAPER_PERFORMANCE_V3_POLICY_VERSION,
      reason: "QUOTE_MISSING",
    };
    expect(toPaperPerformanceSnapshotRpcParamsV3({
      userId: "user-1",
      accountId: "account-1",
      performance: unavailable,
    })).toBeNull();
  });

  it("validates canonical numeric relationships in persisted rows", () => {
    const mapped = mapPaperPerformanceSnapshotV3(storedRow());
    expect(mapped).not.toBeNull();
    expect(mapped).toMatchObject({
      startingCash: 100_000,
      equity: 100_100,
      profitLoss: 100,
      returnPercent: 0.1,
      quoteCount: 1,
    });
  });

  it("accepts PostgreSQL negative half-tie rounding at ten decimals", () => {
    const mapped = mapPaperPerformanceSnapshotV3(storedRow({
      cash_value: "99999.9999999500",
      positions_market_value: "0.0000000000",
      equity: "99999.9999999500",
      profit_loss: "-0.0000000500",
      return_percent: "-0.0000000001",
      open_position_count: 0,
      quote_count: 0,
      oldest_quote_observed_at: null,
    }));
    expect(mapped).not.toBeNull();
    expect(mapped?.returnPercent).toBe(-0.0000000001);
  });

  it("rejects tampered derived values and quote metadata", () => {
    expect(mapPaperPerformanceSnapshotV3(storedRow({ equity: "100101.0000000000" }))).toBeNull();
    expect(mapPaperPerformanceSnapshotV3(storedRow({ profit_loss: "101.0000000000" }))).toBeNull();
    expect(mapPaperPerformanceSnapshotV3(storedRow({ return_percent: "0.2000000000" }))).toBeNull();
    expect(mapPaperPerformanceSnapshotV3(storedRow({ quote_count: 0 }))).toBeNull();
    expect(mapPaperPerformanceSnapshotV3(storedRow({ oldest_quote_observed_at: "2026-09-05T19:00:00.000Z" }))).toBeNull();
  });

  it("accepts an all-cash snapshot without quote timestamps", () => {
    const mapped = mapPaperPerformanceSnapshotV3(storedRow({
      base_currency: "SEK",
      cash_value: "100000.0000000000",
      positions_market_value: "0.0000000000",
      equity: "100000.0000000000",
      profit_loss: "0.0000000000",
      return_percent: "0.0000000000",
      open_position_count: 0,
      quote_count: 0,
      oldest_quote_observed_at: null,
    }));
    expect(mapped).toMatchObject({ baseCurrency: "SEK", quoteCount: 0, returnPercent: 0 });
  });

  it("bounds and owner-scopes snapshot history reads", () => {
    expect(repositorySource).toContain('.eq("user_id", userId)');
    expect(repositorySource).toContain('.eq("account_id", accountId)');
    expect(repositorySource).toContain('.eq("policy_version", PAPER_PERFORMANCE_V3_POLICY_VERSION)');
    expect(repositorySource).toContain("limit < 1 || limit > 100");
    expect(repositorySource).toContain('.order("evaluated_at", { ascending: false })');
  });

  it("persists through the protected RPC rather than direct table DML", () => {
    expect(repositorySource).toContain('supabase.rpc("record_paper_performance_snapshot_v3", params)');
    expect(repositorySource).not.toContain('.from("paper_performance_snapshots_v3").insert');
    expect(repositorySource).not.toContain('.from("paper_performance_snapshots_v3").update');
    expect(repositorySource).not.toContain('.from("paper_performance_snapshots_v3").delete');
  });
});