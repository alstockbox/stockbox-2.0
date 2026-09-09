import { z } from "zod";
import type { AnalysisReport } from "@/lib/analysis/types";
import { captureServerEvent } from "@/lib/analytics/events";
import { getCurrentUser } from "@/lib/auth/session";
import { convertWithComparisonFxContext, resolveComparisonFxContexts } from "@/lib/data/ecb-fx";
import {
  applyPortfolioWeights,
  buildPortfolioPositions,
  calculatePortfolioLedgerPerformance,
  calculatePortfolioTotalProfitLoss,
  calculatePortfolioTotals,
  diversificationScore,
  weightedAverage,
  type PortfolioTransactionInput,
  type ValuedPortfolioPosition,
} from "@/lib/portfolio/portfolio-math";
import { checkDistributedRateLimit, clientRateLimitKey, rateLimitExceededResponse } from "@/lib/security/rate-limit";
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

  const { data: revisionRow, error: revisionError } = await supabase
    .from("portfolio_ledger_revisions")
    .select("revision")
    .eq("portfolio_id", portfolio.id)
    .maybeSingle();
  if (revisionError) {
    return Response.json({ error: "Portfolio ledger revision migration is required before analysis." }, { status: 503 });
  }
  const expectedRevision = Number(revisionRow?.revision ?? 0);
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
    return Response.json({ error: "Portfolio ledger revision is invalid." }, { status: 503 });
  }

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
  if (!transactions.length) return Response.json({ error: "Add at least one transaction before analyzing the portfolio." }, { status: 422 });

  const positions = buildPortfolioPositions(transactions);
  const tickers = [...new Set(positions.map((position) => position.ticker))];
  let analysisRows: StoredAnalysis[] = [];
  if (tickers.length) {
    const { data } = await supabase
      .from("analyses")
      .select("id,ticker,created_at,score,recommendation,report")
      .eq("user_id", user.id)
      .in("ticker", tickers)
      .order("created_at", { ascending: false });
    analysisRows = (data ?? []) as StoredAnalysis[];
  }
  const latest = new Map<string, StoredAnalysis>();
  for (const row of analysisRows) {
    const ticker = row.ticker.trim().toUpperCase();
    if (!latest.has(ticker)) latest.set(ticker, row);
  }

  const baseCurrency = normalizeCurrency(portfolio.base_currency);
  const historicalRequests = transactions
    .filter((transaction): transaction is PortfolioTransactionInput & { id: string } => Boolean(transaction.id))
    .map((transaction) => ({
      id: transaction.id,
      currency: transaction.currency,
      date: transaction.executedAt,
    }));
  const historicalFx = await resolveComparisonFxContexts(historicalRequests, baseCurrency);
  const historicalRates = new Map<string, number | null>(
    historicalRequests.map((historicalRequest) => [
      historicalRequest.id,
      convertWithComparisonFxContext(1, historicalFx.get(historicalRequest.id)),
    ]),
  );
  const ledger = calculatePortfolioLedgerPerformance(transactions, historicalRates);

  const marketRequests = positions.map((position, index) => {
    const analysis = latest.get(position.ticker) ?? null;
    const report = analysis?.report ?? null;
    return {
      id: `market-${index}`,
      currency: report?.market?.currency ?? position.currency,
      date: report?.market?.date ?? analysis?.created_at?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
    };
  });
  const marketFx = marketRequests.length
    ? await resolveComparisonFxContexts(marketRequests, baseCurrency)
    : new Map();

  const failures: Array<{ ticker: string; reason: string }> = [];
  const rawValued: ValuedPortfolioPosition[] = positions.map((position, index) => {
    const analysis = latest.get(position.ticker) ?? null;
    const report = analysis?.report ?? null;
    const currentPrice = numeric(report?.market?.price);
    const marketCurrency = report?.market?.currency ?? position.currency;
    const baseCost = ledger.costBasisBaseByPosition.get(`${position.ticker}:${position.currency}`) ?? null;
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
  const totals = positions.length
    ? calculatePortfolioTotals(valued)
    : {
        investedCapital: 0,
        marketValue: 0,
        unrealizedProfitLoss: 0,
        unrealizedProfitLossPercent: null,
        complete: true,
      };
  const totalProfitLoss = calculatePortfolioTotalProfitLoss({
    realizedProfitLossBase: ledger.realizedProfitLossBase,
    unrealizedProfitLossBase: totals.unrealizedProfitLoss,
    dividendIncomeBase: ledger.dividendIncomeBase,
    standaloneFeesBase: ledger.standaloneFeesBase,
  });
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
  const snapshotPayload = {
    base_currency: baseCurrency,
    portfolio_value: totals.marketValue,
    invested_capital: totals.investedCapital,
    unrealized_pl: totals.unrealizedProfitLoss,
    unrealized_pl_percent: totals.unrealizedProfitLossPercent,
    realized_pl: ledger.realizedProfitLossBase,
    dividend_income: ledger.dividendIncomeBase,
    standalone_fees: ledger.standaloneFeesBase,
    trading_fees: ledger.tradingFeesBase,
    total_fees: ledger.totalFeesBase,
    total_pl: totalProfitLoss,
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
      methodology: positions.length ? "market-value-weighted-v1" : "closed-ledger-v1",
      completeValuation: allValued,
      strongestHolding: ranked[0]?.signal.ticker ?? null,
      weakestHolding: ranked.at(-1)?.signal.ticker ?? null,
      largestPosition: largest?.ticker ?? null,
      largestPositionWeight: largest?.weight ?? null,
      analyzedHoldings: signals.filter(({ signal }) => signal.analysisId).length,
      totalHoldings: positions.length,
    },
    prices_updated_at: positions.length ? now : null,
    analyses_updated_at: signals.map(({ signal }) => signal.analysisDate).filter(Boolean).sort().at(-1) ?? null,
  };

  const { data: snapshotRows, error: snapshotError } = await supabase.rpc("insert_portfolio_snapshot_if_current", {
    p_portfolio_id: portfolio.id,
    p_expected_revision: expectedRevision,
    p_snapshot: snapshotPayload,
  });
  const snapshot = Array.isArray(snapshotRows) ? snapshotRows[0] : null;
  if (snapshotError) {
    captureServerEvent("portfolio_analysis_failed", { userId: user.id, errorCode: "snapshot_persistence" });
    return Response.json({ error: "Portfolio analysis completed but the snapshot could not be saved." }, { status: 503 });
  }
  if (!snapshot) {
    captureServerEvent("portfolio_analysis_failed", { userId: user.id, errorCode: "ledger_changed_during_snapshot" });
    return Response.json({ error: "Portfolio changed while it was being analyzed. Run the analysis again." }, { status: 409 });
  }

  captureServerEvent("portfolio_snapshot_created", { userId: user.id, holdingCount: positions.length, failedCount: failures.length });
  captureServerEvent("portfolio_analysis_completed", { userId: user.id, holdingCount: positions.length, failedCount: failures.length });
  return Response.json({
    ok: true,
    snapshot: {
      id: snapshot.id,
      createdAt: snapshot.created_at,
      ledgerRevision: snapshot.ledger_revision,
      baseCurrency,
      totals,
      performance: {
        realizedProfitLoss: ledger.realizedProfitLossBase,
        unrealizedProfitLoss: totals.unrealizedProfitLoss,
        dividendIncome: ledger.dividendIncomeBase,
        standaloneFees: ledger.standaloneFeesBase,
        tradingFees: ledger.tradingFeesBase,
        totalFees: ledger.totalFeesBase,
        totalProfitLoss,
      },
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
