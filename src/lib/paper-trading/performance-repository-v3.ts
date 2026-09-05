import { createAdminClient } from "@/lib/supabase/admin";
import {
  PAPER_PERFORMANCE_V3_POLICY_VERSION,
  PAPER_TRADING_V3_FIXED_STARTING_CASH,
  type PaperPerformanceResultV3,
} from "./performance-v3";

export type PaperPerformanceSnapshotRowV3 = {
  id: string;
  accountId: string;
  userId: string;
  baseCurrency: string;
  startingCash: number;
  cashValue: number;
  positionsMarketValue: number;
  equity: number;
  profitLoss: number;
  returnPercent: number;
  openPositionCount: number;
  quoteCount: number;
  evaluatedAt: string;
  oldestQuoteObservedAt: string | null;
  policyVersion: typeof PAPER_PERFORMANCE_V3_POLICY_VERSION;
  pricingBasis: "VERIFIED_MARK_TO_MARKET";
  createdAt: string;
};

export type PaperPerformanceSnapshotWriteResultV3 =
  | { ok: true; snapshot: PaperPerformanceSnapshotRowV3 }
  | { ok: false; error: string };

export type PaperPerformanceSnapshotListResultV3 =
  | { ok: true; snapshots: PaperPerformanceSnapshotRowV3[] }
  | { ok: false; error: string; snapshots: [] };

type JsonRow = Record<string, unknown>;

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numeric(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function integer(value: unknown): number | null {
  const parsed = numeric(value);
  return parsed !== null && Number.isSafeInteger(parsed) ? parsed : null;
}

function validIso(value: unknown): string | null {
  const candidate = text(value);
  return candidate && Number.isFinite(Date.parse(candidate)) ? candidate : null;
}

function close(left: number, right: number, absoluteTolerance = 1e-8): boolean {
  if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
  const floatingPointTolerance = Number.EPSILON * Math.max(1, Math.abs(left), Math.abs(right)) * 8;
  return Math.abs(left - right) <= Math.max(absoluteTolerance, floatingPointTolerance);
}

function withinPostgresRound10(persisted: number, rawValue: number): boolean {
  // PostgreSQL round(numeric, 10) and JavaScript Math.round disagree on exact
  // negative half ties. Compare the persisted DB value with the unrounded formula
  // within half a 10-decimal unit instead of re-implementing DB rounding in JS.
  return close(persisted, rawValue, 5.1e-11);
}

export function mapPaperPerformanceSnapshotV3(row: JsonRow): PaperPerformanceSnapshotRowV3 | null {
  const id = text(row.id);
  const accountId = text(row.account_id);
  const userId = text(row.user_id);
  const baseCurrency = text(row.base_currency)?.toUpperCase() ?? null;
  const startingCash = numeric(row.starting_cash);
  const cashValue = numeric(row.cash_value);
  const positionsMarketValue = numeric(row.positions_market_value);
  const equity = numeric(row.equity);
  const profitLoss = numeric(row.profit_loss);
  const returnPercent = numeric(row.return_percent);
  const openPositionCount = integer(row.open_position_count);
  const quoteCount = integer(row.quote_count);
  const evaluatedAt = validIso(row.evaluated_at);
  const oldestQuoteObservedAt = row.oldest_quote_observed_at === null
    ? null
    : validIso(row.oldest_quote_observed_at);
  const policyVersion = text(row.policy_version);
  const pricingBasis = text(row.pricing_basis);
  const createdAt = validIso(row.created_at);

  if (
    !id
    || !accountId
    || !userId
    || !baseCurrency
    || !/^[A-Z]{3}$/.test(baseCurrency)
    || startingCash !== PAPER_TRADING_V3_FIXED_STARTING_CASH
    || cashValue === null
    || cashValue < 0
    || positionsMarketValue === null
    || positionsMarketValue < 0
    || equity === null
    || equity < 0
    || profitLoss === null
    || returnPercent === null
    || openPositionCount === null
    || openPositionCount < 0
    || quoteCount === null
    || quoteCount !== openPositionCount
    || !evaluatedAt
    || !createdAt
    || policyVersion !== PAPER_PERFORMANCE_V3_POLICY_VERSION
    || pricingBasis !== "VERIFIED_MARK_TO_MARKET"
  ) return null;

  if ((quoteCount === 0 && oldestQuoteObservedAt !== null) || (quoteCount > 0 && !oldestQuoteObservedAt)) return null;
  if (oldestQuoteObservedAt) {
    const evaluatedMs = Date.parse(evaluatedAt);
    const observedMs = Date.parse(oldestQuoteObservedAt);
    if (observedMs > evaluatedMs + 30_000 || evaluatedMs - observedMs > 20 * 60_000) return null;
  }

  const expectedEquity = cashValue + positionsMarketValue;
  const expectedProfitLoss = expectedEquity - startingCash;
  const rawExpectedReturnPercent = (expectedProfitLoss / startingCash) * 100;
  if (
    !close(equity, expectedEquity)
    || !close(profitLoss, expectedProfitLoss)
    || !withinPostgresRound10(returnPercent, rawExpectedReturnPercent)
  ) return null;

  return {
    id,
    accountId,
    userId,
    baseCurrency,
    startingCash,
    cashValue,
    positionsMarketValue,
    equity,
    profitLoss,
    returnPercent,
    openPositionCount,
    quoteCount,
    evaluatedAt,
    oldestQuoteObservedAt,
    policyVersion: PAPER_PERFORMANCE_V3_POLICY_VERSION,
    pricingBasis: "VERIFIED_MARK_TO_MARKET",
    createdAt,
  };
}

export function toPaperPerformanceSnapshotRpcParamsV3(input: {
  userId: string;
  accountId: string;
  performance: PaperPerformanceResultV3;
}) {
  const userId = input.userId.trim();
  const accountId = input.accountId.trim();
  const performance = input.performance;
  if (!userId || !accountId || performance.status !== "VERIFIED" || !performance.rankEligible) return null;
  if (
    performance.policyVersion !== PAPER_PERFORMANCE_V3_POLICY_VERSION
    || performance.pricingBasis !== "VERIFIED_MARK_TO_MARKET"
    || performance.startingCash !== PAPER_TRADING_V3_FIXED_STARTING_CASH
    || !/^[A-Z]{3}$/.test(performance.baseCurrency)
    || !Number.isFinite(performance.cashValue)
    || performance.cashValue < 0
    || !Number.isFinite(performance.positionsMarketValue)
    || performance.positionsMarketValue < 0
    || !Number.isSafeInteger(performance.openPositionCount)
    || performance.openPositionCount < 0
    || !Number.isSafeInteger(performance.quoteCount)
    || performance.quoteCount !== performance.openPositionCount
    || !Number.isFinite(Date.parse(performance.evaluatedAt))
  ) return null;
  if (
    (performance.quoteCount === 0 && performance.oldestQuoteObservedAt !== null)
    || (performance.quoteCount > 0 && (!performance.oldestQuoteObservedAt || !Number.isFinite(Date.parse(performance.oldestQuoteObservedAt))))
  ) return null;

  return {
    p_user_id: userId,
    p_account_id: accountId,
    p_base_currency: performance.baseCurrency,
    p_cash_value: performance.cashValue,
    p_positions_market_value: performance.positionsMarketValue,
    p_open_position_count: performance.openPositionCount,
    p_quote_count: performance.quoteCount,
    p_evaluated_at: performance.evaluatedAt,
    p_oldest_quote_observed_at: performance.oldestQuoteObservedAt,
  } as const;
}

function snapshotMatchesPerformance(
  snapshot: PaperPerformanceSnapshotRowV3,
  input: { userId: string; accountId: string; performance: Extract<PaperPerformanceResultV3, { status: "VERIFIED" }> },
): boolean {
  const performance = input.performance;
  return snapshot.userId === input.userId.trim()
    && snapshot.accountId === input.accountId.trim()
    && snapshot.baseCurrency === performance.baseCurrency
    && snapshot.startingCash === performance.startingCash
    && close(snapshot.cashValue, performance.cashValue)
    && close(snapshot.positionsMarketValue, performance.positionsMarketValue)
    && close(snapshot.equity, performance.equity)
    && close(snapshot.profitLoss, performance.profitLoss)
    && withinPostgresRound10(snapshot.returnPercent, performance.returnPercent)
    && snapshot.openPositionCount === performance.openPositionCount
    && snapshot.quoteCount === performance.quoteCount
    && Date.parse(snapshot.evaluatedAt) === Date.parse(performance.evaluatedAt)
    && (snapshot.oldestQuoteObservedAt === null
      ? performance.oldestQuoteObservedAt === null
      : performance.oldestQuoteObservedAt !== null
        && Date.parse(snapshot.oldestQuoteObservedAt) === Date.parse(performance.oldestQuoteObservedAt));
}

export async function persistVerifiedPaperPerformanceSnapshotV3(input: {
  userId: string;
  accountId: string;
  performance: PaperPerformanceResultV3;
}): Promise<PaperPerformanceSnapshotWriteResultV3> {
  const params = toPaperPerformanceSnapshotRpcParamsV3(input);
  if (!params || input.performance.status !== "VERIFIED") {
    return { ok: false, error: "PAPER_PERFORMANCE_NOT_VERIFIED" };
  }

  const supabase = createAdminClient();
  if (!supabase) return { ok: false, error: "SUPABASE_ADMIN_NOT_CONFIGURED" };

  try {
    const { data, error } = await supabase.rpc("record_paper_performance_snapshot_v3", params);
    if (error) return { ok: false, error: error.message };
    const raw = Array.isArray(data) ? data[0] : data;
    const snapshot = raw && typeof raw === "object" ? mapPaperPerformanceSnapshotV3(raw as JsonRow) : null;
    if (!snapshot) return { ok: false, error: "PAPER_PERFORMANCE_SNAPSHOT_INVALID_RESULT" };
    if (!snapshotMatchesPerformance(snapshot, { ...input, performance: input.performance })) {
      return { ok: false, error: "PAPER_PERFORMANCE_SNAPSHOT_MISMATCH" };
    }
    return { ok: true, snapshot };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "PAPER_PERFORMANCE_SNAPSHOT_WRITE_FAILED" };
  }
}

export async function loadPaperPerformanceSnapshotsV3(input: {
  userId: string;
  accountId: string;
  limit?: number;
}): Promise<PaperPerformanceSnapshotListResultV3> {
  const userId = input.userId.trim();
  const accountId = input.accountId.trim();
  const limit = input.limit ?? 30;
  if (!userId || !accountId || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    return { ok: false, error: "PAPER_PERFORMANCE_SNAPSHOT_QUERY_INVALID", snapshots: [] };
  }

  const supabase = createAdminClient();
  if (!supabase) return { ok: false, error: "SUPABASE_ADMIN_NOT_CONFIGURED", snapshots: [] };

  try {
    const { data, error } = await supabase
      .from("paper_performance_snapshots_v3")
      .select("id,account_id,user_id,base_currency,starting_cash,cash_value,positions_market_value,equity,profit_loss,return_percent,open_position_count,quote_count,evaluated_at,oldest_quote_observed_at,policy_version,pricing_basis,created_at")
      .eq("user_id", userId)
      .eq("account_id", accountId)
      .eq("policy_version", PAPER_PERFORMANCE_V3_POLICY_VERSION)
      .order("evaluated_at", { ascending: false })
      .limit(limit);
    if (error) return { ok: false, error: error.message, snapshots: [] };

    const snapshots = (data ?? []).map((row) => mapPaperPerformanceSnapshotV3(row as JsonRow));
    if (snapshots.some((row) => row === null)) {
      return { ok: false, error: "PAPER_PERFORMANCE_SNAPSHOT_LEDGER_INVALID", snapshots: [] };
    }
    return {
      ok: true,
      snapshots: snapshots.filter((row): row is PaperPerformanceSnapshotRowV3 => row !== null),
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "PAPER_PERFORMANCE_SNAPSHOT_LOAD_FAILED",
      snapshots: [],
    };
  }
}