import { z } from "zod";
import type { AnalysisReport } from "@/lib/analysis/types";
import { captureServerEvent } from "@/lib/analytics/events";
import { getCurrentUser } from "@/lib/auth/session";
import { convertWithComparisonFxContext, resolveComparisonFxContexts } from "@/lib/data/ecb-fx";
import {
  applyPortfolioWeights,
  buildPortfolioPositions,
  calculatePortfolioTotals,
  diversificationScore,
  weightedAverage,
  type PortfolioTransactionInput,
  type ValuedPortfolioPosition,
} from "@/lib/portfolio/portfolio-math";
import { checkDistributedRateLimit, clientRateLimitKey, rateLimitExceededResponse } from "@/lib/security/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const SNAPSHOT_LIMIT = { limit: 12, windowMs: 10 * 60 * 1000 } as const;
const requestSchema = z.object({ portfolioId: z.string().uuid() });

type StoredAnalysis = {
  id: string;
  ticker: string;
  created_at: string;
  score: number | null;
  recommendation: string;
  report: AnalysisReport;
};

type TransactionRow = {
  id: string;
  ticker: string;
  transaction_type: "buy" | "sell" | "fee" | "dividend";
  quantity: number | string | null;
  price: number | string | null;
  cash_amount: number | string | null;
  fees: number | string | null;
  currency: string;
  executed_at: string;
};

type PositionSignal = {
  ticker: string;
  recommendation: string | null;
  analysisId: string | null;
  analysisDate: string | null;
  score: number | null;
  valuation: number | null;
  growth: number | null;
  profitability: number | null;
  financialHealth: number | null;
  quality: number | null;
  risk: number | null;
  momentum: number | null;
};

function numeric(value: number | string | null | undefined) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeCurrency(value: string) {
  return value.trim().toUpperCase();
}

function dimension(report: AnalysisReport | null, key: string) {
  return report?.score.dimensions.find((item) => item.key === key)?.score ?? null;
}

function reportSignal(analysis: StoredAnalysis | null, ticker: string): PositionSignal {
  const report = analysis?.report ?? null;
  return {
    ticker,
    recommendation: analysis?.recommendation ?? report?.recommendation ?? null,
    analysisId: analysis?.id ?? null,
    analysisDate: analysis?.created_at ?? report?.generatedAt ?? null,
    score: numeric(analysis?.score) ?? report?.score.score ?? null,
    valuation: dimension(report, "valuation"),
    growth: dimension(report, "growth"),
    profitability: dimension(report, "profitability"),
    financialHealth: dimension(report, "financialHealth"),
    quality: dimension(report, "quality"),
    risk: dimension(report, "risk"),
    momentum: dimension(report, "momentum"),
  };
}

async function baseCostByPosition(
  transactions: PortfolioTransactionInput[],
  baseCurrency: string,
): Promise<Map<string, number | null>> {
  const buyTransactions = transactions.filter((transaction) => transaction.type === "buy" && transaction.quantity && transaction.price !== null && transaction.price !== undefined);
  const requests = buyTransactions.map((transaction, index) => ({
    id: transaction.id ?? `buy-${index}`,
    currency: transaction.currency,
    date: transaction.executedAt,
  }));
  const fx = await resolveComparisonFxContexts(requests, baseCurrency);
  const states = new Map<string, { quantity: number; baseCost: number | null }>();

  for (const transaction of [...transactions].sort((left, right) => left.executedAt.localeCompare(right.executedAt))) {
    if (transaction.type !== "buy" && transaction.type !== "sell") continue;
    const key = `${transaction.ticker.trim().toUpperCase()}:${normalizeCurrency(transaction.currency)}`;
    const state = states.get(key) ?? { quantity: 0, baseCost: 0 };
    const quantity = numeric(transaction.quantity);
    if (quantity === null || quantity <= 0) continue;
    if (transaction.type === "buy") {
      const price = numeric(transaction.price);
      if (price === null || price < 0) continue;
      const nativeAmount = quantity * price + (numeric(transaction.fees) ?? 0);
      const requestId = transaction.id ?? requests.find((request) => request.currency === transaction.currency && request.date === transaction.executedAt)?.id;
      const converted = requestId ? convertWithComparisonFxContext(nativeAmount, fx.get(requestId)) : null;
      state.baseCost = state.baseCost === null || converted === null ? null : state.baseCost + converted;
      state.quantity += quantity;
    } else if (state.quantity > 0) {
      const sold = Math.min(quantity, state.quantity);
      if (state.baseCost !== null) state.baseCost = Math.max(0, state.baseCost - (state.baseCost / state.quantity) * sold);
      state.quantity -= sold;
    }
    if (state.quantity <= 1e-10) states.delete(key);
    else states.set(key, state);
  }

  return new Map([...states.entries()].map(([key, state]) => [key, state.baseCost]));
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in to analyze a portfolio." }, { status: 401 });
  const rateLimit = await checkDistributedRateLimit(clientRateLimitKey(request, "portfolio-snapshot", user.id), SNAPSHOT_LIMIT);
  if (!rateLimit.allowed) return rateLimitExceededResponse(rateLimit);
  const body = requestSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Invalid portfolio request." }, { status: 422 });

  const supabase = await createClient();
  if (!supabase) return Response.json({ error: "Portfolio storage is unavailable." }, { status: 503 });
  const { data: portfolio } = await supabase.from("portfolios").select("id,name,base_currency").eq("id", body.data.portfolioId).eq("user_id", user.id).maybeSingle();
  if (!portfolio) return Response.json({ error: "Portfolio not found." }, { status: 404 });

  const { data: transactionRows, error: transactionError } = await supabase
    .from("portfolio_transactions")
    .select("id,ticker,transaction_type,quantity,price,cash_amount,fees,currency,executed_at")
    .eq("portfolio_id", portfolio.id)
    .order("executed_at", { ascending: true });
  if (transactionError) return Response.json({ error: "Portfolio transaction migration is required before analysis." }, { status: 503 });

  const transactions: PortfolioTransactionInput[] = ((transactionRows ?? []) as TransactionRow[]).map((row) => ({
    id: row.id,
    ticker: row.ticker,
    type: row.transaction_type,
    quantity: numeric(row.quantity),
    price: numeric(row.price),
    cashAmount: numeric(row.cash_amount),
    fees: numeric(row.fees),
    currency: row.currency,
    executedAt: row.executed_at,
  }));
  const positions = buildPortfolioPositions(transactions);
  if (!positions.length) return Response.json({ error: "Add at least one position before analyzing the portfolio." }, { status: 422 });

  const tickers = [...new Set(positions.map((position) => position.ticker))];
  const { data: analysisRows } = await supabase
    .from("analyses")
    .select("id,ticker,created_at,score,recommendation,report")
    .eq("user_id", user.id)
    .in("ticker", tickers)
    .order("created_at", { ascending: false });
  const latest = new Map<string, StoredAnalysis>();
  for (const row of (analysisRows ?? []) as StoredAnalysis[]) {
    const ticker = row.ticker.trim().toUpperCase();
    if (!latest.has(ticker)) latest.set(ticker, row);
  }

  const baseCurrency = normalizeCurrency(portfolio.base_currency);
  const baseCosts = await baseCostByPosition(transactions, baseCurrency);
  const marketRequests = positions.map((position, index) => {
    const analysis = latest.get(position.ticker) ?? null;
    const report = analysis?.report ?? null;
    return {
      id: `market-${index}`,
      currency: report?.market?.currency ?? position.currency,
      date: report?.market?.date ?? analysis?.created_at?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
    };
  });
  const marketFx = await resolveComparisonFxContexts(marketRequests, baseCurrency);

  const failures: Array<{ ticker: string; reason: string }> = [];
  const rawValued: ValuedPortfolioPosition[] = positions.map((position, index) => {
    const analysis = latest.get(position.ticker) ?? null;
    const report = analysis?.report ?? null;
    const currentPrice = numeric(report?.market?.price);
    const marketCurrency = report?.market?.currency ?? position.currency;
    const baseCost = baseCosts.get(`${position.ticker}:${position.currency}`) ?? null;
    const marketRate = convertWithComparisonFxContext(1, marketFx.get(`market-${index}`));
    const nativeMarketValue = currentPrice === null ? null : currentPrice * position.quantity;
    const marketValueBase = nativeMarketValue === null || marketRate === null ? null : nativeMarketValue * marketRate;
    if (!analysis) failures.push({ ticker: position.ticker, reason: "No saved analysis is available yet." });
    else if (currentPrice === null) failures.push({ ticker: position.ticker, reason: "Current market price is unavailable in the latest analysis." });
    if (baseCost === null || marketRate === null) failures.push({ ticker: position.ticker, reason: "FX normalization is unavailable for this position." });
    return {
      ...position,
      currentPrice,
      marketCurrency,
      currentMarketValue: nativeMarketValue,
      unrealizedProfitLoss: marketCurrency === position.currency && nativeMarketValue !== null ? nativeMarketValue - position.costBasis : null,
      unrealizedProfitLossPercent: marketCurrency === position.currency && nativeMarketValue !== null && position.costBasis > 0 ? ((nativeMarketValue - position.costBasis) / position.costBasis) * 100 : null,
      costBasisBase: baseCost,
      marketValueBase,
      unrealizedProfitLossBase: baseCost !== null && marketValueBase !== null ? marketValueBase - baseCost : null,
      weight: null,
      valuationStatus: currentPrice === null ? "missing_price" : baseCost === null || marketRate === null ? "missing_fx" : "available",
    } satisfies ValuedPortfolioPosition;
  });

  const allValued = rawValued.every((position) => position.valuationStatus === "available");
  const valued = allValued ? applyPortfolioWeights(rawValued) : rawValued;
  const totals = calculatePortfolioTotals(valued);
  const signals = valued.map((position) => ({ position, signal: reportSignal(latest.get(position.ticker) ?? null, position.ticker) }));
  const aggregate = (key: keyof PositionSignal) => allValued
    ? weightedAverage(signals.map(({ position, signal }) => ({ value: typeof signal[key] === "number" ? signal[key] as number : null, weight: position.weight })))
    : null;
  const portfolioScore = aggregate("score");
  const riskScore = aggregate("risk");
  const valuationScore = aggregate("valuation");
  const qualityScore = aggregate("quality");
  const growthScore = aggregate("growth");
  const momentumScore = aggregate("momentum");
  const diversification = allValued ? diversificationScore(valued.map((position) => position.weight ?? 0)) : null;
  const ranked = signals.filter(({ signal }) => signal.score !== null).sort((left, right) => (right.signal.score ?? 0) - (left.signal.score ?? 0));
  const largest = allValued ? [...valued].sort((left, right) => (right.weight ?? 0) - (left.weight ?? 0))[0] ?? null : null;
  const holdings = signals.map(({ position, signal }) => ({ ...position, signal }));
  const now = new Date().toISOString();

  const snapshotStore = createAdminClient();
  if (!snapshotStore) return Response.json({ error: "Portfolio snapshot storage is unavailable." }, { status: 503 });

  const { data: snapshot, error: snapshotError } = await snapshotStore.from("portfolio_snapshots").insert({
    portfolio_id: portfolio.id,
    user_id: user.id,
    base_currency: baseCurrency,
    portfolio_value: totals.marketValue,
    invested_capital: totals.investedCapital,
    unrealized_pl: totals.unrealizedProfitLoss,
    unrealized_pl_percent: totals.unrealizedProfitLossPercent,
    portfolio_score: portfolioScore,
    risk_score: riskScore,
    valuation_score: valuationScore,
    quality_score: qualityScore,
    growth_score: growthScore,
    momentum_score: momentumScore,
    diversification_score: diversification,
    holdings,
    failures,
    analysis_summary: {
      methodology: "market-value-weighted-v1",
      completeValuation: allValued,
      strongestHolding: ranked[0]?.signal.ticker ?? null,
      weakestHolding: ranked.at(-1)?.signal.ticker ?? null,
      largestPosition: largest?.ticker ?? null,
      largestPositionWeight: largest?.weight ?? null,
      analyzedHoldings: signals.filter(({ signal }) => signal.analysisId).length,
      totalHoldings: positions.length,
    },
    prices_updated_at: now,
    analyses_updated_at: signals.map(({ signal }) => signal.analysisDate).filter(Boolean).sort().at(-1) ?? null,
  }).select("id,created_at").single();
  if (snapshotError || !snapshot) {
    captureServerEvent("portfolio_analysis_failed", { userId: user.id, errorCode: "snapshot_persistence" });
    return Response.json({ error: "Portfolio analysis completed but the snapshot could not be saved." }, { status: 503 });
  }

  captureServerEvent("portfolio_snapshot_created", { userId: user.id, holdingCount: positions.length, failedCount: failures.length });
  captureServerEvent("portfolio_analysis_completed", { userId: user.id, holdingCount: positions.length, failedCount: failures.length });
  return Response.json({
    ok: true,
    snapshot: {
      id: snapshot.id,
      createdAt: snapshot.created_at,
      baseCurrency,
      totals,
      portfolioScore,
      riskScore,
      valuationScore,
      qualityScore,
      growthScore,
      momentumScore,
      diversificationScore: diversification,
      holdings,
      failures,
      completeValuation: allValued,
    },
  });
}
