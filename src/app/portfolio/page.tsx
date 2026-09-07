import type { Metadata } from "next";
import { AlertTriangle, ArrowLeft, BriefcaseBusiness, CalendarDays, ChevronRight, Plus, Save, Sparkles, Trash2, TrendingDown, TrendingUp } from "lucide-react";
import type { AnalysisReport } from "@/lib/analysis/types";
import { PortfolioAiCoach } from "@/components/portfolio/portfolio-ai-coach";
import { PortfolioAnalyzer } from "@/components/portfolio/portfolio-analyzer";
import { PortfolioPurchaseForm } from "@/components/portfolio/portfolio-purchase-form";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, Container, Section } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth/session";
import { getP0Copy } from "@/lib/i18n/p0-copy";
import { getLocale } from "@/lib/i18n/server";
import { buildPortfolioPositions, calculateRealizedPortfolioPerformance, type PortfolioTransactionInput } from "@/lib/portfolio/portfolio-math";
import { createClient } from "@/lib/supabase/server";
import {
  createPortfolioAction,
  deletePortfolioAction,
  removePortfolioTransactionAction,
  sellHoldingAction,
  updatePortfolioTransactionAction,
} from "@/lib/workspace/actions";

export const metadata: Metadata = { title: "Portfolio" };

type PageProps = { searchParams: Promise<{ limit?: string; error?: string; portfolio?: string }> };
type Numeric = number | string | null;
type PortfolioRow = { id: string; name: string; base_currency: string; created_at: string };
type HoldingRow = { id: string; portfolio_id: string; ticker: string; quantity: Numeric; average_cost: Numeric; currency: string; acquired_at: string | null; created_at: string };
type TransactionRow = { id: string; portfolio_id: string; ticker: string; transaction_type: "buy" | "sell" | "fee" | "dividend"; quantity: Numeric; price: Numeric; cash_amount: Numeric; fees: Numeric; currency: string; executed_at: string; created_at: string };
type AnalysisRow = { id: string; ticker: string; created_at: string; score: Numeric; recommendation: string; report: AnalysisReport };
type SnapshotHolding = {
  ticker?: string;
  currency?: string;
  quantity?: number;
  averagePurchasePrice?: number;
  currentPrice?: number | null;
  marketCurrency?: string | null;
  costBasisBase?: number | null;
  marketValueBase?: number | null;
  unrealizedProfitLossBase?: number | null;
  weight?: number | null;
};
type SnapshotRow = {
  id: string;
  portfolio_id: string;
  base_currency: string;
  portfolio_value: Numeric;
  invested_capital: Numeric;
  unrealized_pl: Numeric;
  unrealized_pl_percent: Numeric;
  portfolio_score: Numeric;
  risk_score: Numeric;
  valuation_score: Numeric;
  quality_score: Numeric;
  growth_score: Numeric;
  momentum_score: Numeric;
  diversification_score: Numeric;
  holdings: SnapshotHolding[] | null;
  failures: Array<{ ticker?: string; reason?: string }> | null;
  analysis_summary: { strongestHolding?: string | null; weakestHolding?: string | null; largestPosition?: string | null; largestPositionWeight?: number | null; completeValuation?: boolean } | null;
  prices_updated_at: string | null;
  analyses_updated_at: string | null;
  created_at: string;
};

function numeric(value: Numeric | undefined) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function money(value: Numeric | undefined, currency: string, locale: "sv" | "en") {
  const amount = numeric(value);
  if (amount === null) return "—";
  try {
    return new Intl.NumberFormat(locale === "sv" ? "sv-SE" : "en-GB", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${amount.toLocaleString(locale === "sv" ? "sv-SE" : "en-GB", { maximumFractionDigits: 2 })} ${currency}`;
  }
}

function percentage(value: Numeric | undefined, digits = 1) {
  const parsed = numeric(value);
  return parsed === null ? "—" : `${parsed.toFixed(digits)}%`;
}

function score(value: Numeric | undefined) {
  const parsed = numeric(value);
  return parsed === null ? "—" : Math.round(parsed).toString();
}

function dateTime(value: string | null | undefined, locale: "sv" | "en") {
  if (!value) return "—";
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toLocaleString(locale === "sv" ? "sv-SE" : "en-GB", { dateStyle: "medium", timeStyle: "short" }) : "—";
}

function dimension(report: AnalysisReport | undefined, key: string) {
  return report?.score.dimensions.find((item) => item.key === key)?.score ?? null;
}

function recommendationTone(recommendation: string | null | undefined) {
  if (!recommendation) return "border-white/10 bg-white/5 text-[#c9d2df]";
  if (recommendation.includes("Buy")) return "border-emerald-400/25 bg-emerald-950/30 text-emerald-100";
  if (recommendation.includes("Sell")) return "border-red-400/25 bg-red-950/30 text-red-100";
  return "border-amber-300/25 bg-amber-950/25 text-amber-100";
}

export default async function PortfolioPage({ searchParams }: PageProps) {
  const [params, user, locale] = await Promise.all([searchParams, getCurrentUser(), getLocale()]);
  const copy = getP0Copy(locale).portfolio;
  const sv = locale === "sv";
  const supabase = user ? await createClient() : null;

  const { data: rawPortfolios } = supabase
    ? await supabase.from("portfolios").select("id,name,base_currency,created_at").order("created_at")
    : { data: [] };
  const portfolios = (rawPortfolios ?? []) as PortfolioRow[];
  const ids = portfolios.map((item) => item.id);

  const holdingResult = supabase && ids.length
    ? await supabase.from("holdings").select("id,portfolio_id,ticker,quantity,average_cost,currency,acquired_at,created_at").in("portfolio_id", ids)
    : { data: [], error: null };
  const holdings = (holdingResult.data ?? []) as HoldingRow[];

  const transactionResult = supabase && ids.length
    ? await supabase.from("portfolio_transactions").select("id,portfolio_id,ticker,transaction_type,quantity,price,cash_amount,fees,currency,executed_at,created_at").in("portfolio_id", ids).order("executed_at", { ascending: false })
    : { data: [], error: null };
  const transactionsAvailable = !transactionResult.error;
  const transactions = (transactionResult.data ?? []) as TransactionRow[];

  const analysisResult = supabase && user
    ? await supabase.from("analyses").select("id,ticker,created_at,score,recommendation,report").eq("user_id", user.id).order("created_at", { ascending: false }).limit(160)
    : { data: [], error: null };
  const analyses = (analysisResult.data ?? []) as AnalysisRow[];
  const analysisHistory = new Map<string, AnalysisRow[]>();
  for (const analysis of analyses) {
    const ticker = analysis.ticker.trim().toUpperCase();
    analysisHistory.set(ticker, [...(analysisHistory.get(ticker) ?? []), analysis]);
  }

  const snapshotResult = supabase && ids.length
    ? await supabase.from("portfolio_snapshots")
      .select("id,portfolio_id,base_currency,portfolio_value,invested_capital,unrealized_pl,unrealized_pl_percent,portfolio_score,risk_score,valuation_score,quality_score,growth_score,momentum_score,diversification_score,holdings,failures,analysis_summary,prices_updated_at,analyses_updated_at,created_at")
      .in("portfolio_id", ids).order("created_at", { ascending: false }).limit(60)
    : { data: [], error: null };
  const snapshotsAvailable = !snapshotResult.error;
  const snapshots = (snapshotResult.data ?? []) as SnapshotRow[];
  const latestSnapshot = new Map<string, SnapshotRow>();
  for (const snapshot of snapshots) if (!latestSnapshot.has(snapshot.portfolio_id)) latestSnapshot.set(snapshot.portfolio_id, snapshot);

  const portfolioStates = portfolios.map((portfolio) => {
    const portfolioHoldings = holdings.filter((holding) => holding.portfolio_id === portfolio.id);
    const portfolioTransactions = transactions.filter((transaction) => transaction.portfolio_id === portfolio.id);
    const transactionInputs: PortfolioTransactionInput[] = transactionsAvailable
      ? portfolioTransactions.map((row) => ({ id: row.id, ticker: row.ticker, type: row.transaction_type, quantity: numeric(row.quantity), price: numeric(row.price), cashAmount: numeric(row.cash_amount), fees: numeric(row.fees), currency: row.currency, executedAt: row.executed_at }))
      : portfolioHoldings.map((holding) => ({ id: holding.id, ticker: holding.ticker, type: "buy", quantity: numeric(holding.quantity), price: numeric(holding.average_cost), fees: 0, currency: holding.currency, executedAt: holding.acquired_at ?? holding.created_at.slice(0, 10) }));
    const positions = buildPortfolioPositions(transactionInputs);
    const realizedPerformance = calculateRealizedPortfolioPerformance(transactionInputs);
    const latest = latestSnapshot.get(portfolio.id) ?? null;
    const history = snapshots.filter((snapshot) => snapshot.portfolio_id === portfolio.id).slice(0, 10);
    const snapshotHoldings = Array.isArray(latest?.holdings) ? latest.holdings : [];
    const summary = latest?.analysis_summary ?? null;
    const concentration = typeof summary?.largestPositionWeight === "number" ? summary.largestPositionWeight : null;
    const analyzerHoldings = positions.map((position) => ({ ticker: position.ticker, lastAnalysisAt: analysisHistory.get(position.ticker)?.[0]?.created_at ?? null }));
    return { portfolio, portfolioTransactions, positions, realizedPerformance, latest, history, snapshotHoldings, summary, concentration, analyzerHoldings };
  });

  const selectedState = params.portfolio ? portfolioStates.find((state) => state.portfolio.id === params.portfolio) ?? null : null;

  const recentCandidates = [...analysisHistory.entries()].map(([ticker, rows]) => {
    const latest = rows[0];
    return {
      ticker,
      name: latest?.report?.companyName ?? ticker,
      score: numeric(latest?.score) ?? latest?.report?.score.score ?? null,
      recommendation: latest?.recommendation ?? latest?.report?.recommendation ?? null,
      valuation: dimension(latest?.report, "valuation"),
      growth: dimension(latest?.report, "growth"),
      quality: dimension(latest?.report, "quality"),
      risk: dimension(latest?.report, "risk"),
      momentum: dimension(latest?.report, "momentum"),
    };
  });

  const aiPortfolioSummaries = portfolioStates.map((state) => ({
    id: state.portfolio.id,
    name: state.portfolio.name,
    portfolioScore: numeric(state.latest?.portfolio_score),
    riskScore: numeric(state.latest?.risk_score),
    diversificationScore: numeric(state.latest?.diversification_score),
    largestPosition: state.summary?.largestPosition ?? null,
    largestPositionWeight: state.concentration,
    holdings: state.positions.map((position) => {
      const latestAnalysis = analysisHistory.get(position.ticker)?.[0];
      const snapshotPosition = state.snapshotHoldings.find((item) => item.ticker === position.ticker && item.currency === position.currency) ?? state.snapshotHoldings.find((item) => item.ticker === position.ticker);
      return {
        ticker: position.ticker,
        weight: snapshotPosition?.weight ?? null,
        score: numeric(latestAnalysis?.score) ?? latestAnalysis?.report?.score.score ?? null,
        recommendation: latestAnalysis?.recommendation ?? latestAnalysis?.report?.recommendation ?? null,
      };
    }),
  }));

  const feedback = params.limit
    ? copy.limit
    : params.error === "transaction_input"
      ? (sv ? "Kontrollera antal, pris, datum, avgift och valuta." : "Check quantity, price, date, fee and currency.")
      : params.error === "transaction_save"
        ? (sv ? "Transaktionen kunde inte sparas. Kontrollera innehavet och försök igen." : "The transaction could not be saved. Check the position and try again.")
        : params.error === "transaction_delete"
          ? (sv ? "Transaktionen kunde inte tas bort." : "The transaction could not be deleted.")
          : params.error === "transaction_sell_quantity"
            ? (sv ? "Försäljningen är större än det tillgängliga innehavet för den tickern och valutan." : "The sale is larger than the available position for that ticker and currency.")
            : params.error === "holding_identity"
              ? (sv ? "Bolaget kunde inte identifieras säkert. Välj ett bolag från sökresultatet och försök igen." : "The company could not be resolved safely. Choose a company from search results and try again.")
              : params.error
                ? copy.error
                : null;
  const today = new Date().toISOString().slice(0, 10);
  const portfolioOptions = portfolios.map((portfolio) => ({ id: portfolio.id, name: portfolio.name, baseCurrency: portfolio.base_currency }));

  return (
    <Section className="pb-10 pt-8 sm:pt-10">
      <Container>
        {!user ? (
          <>
            <p className="text-sm font-semibold text-[#e1cb95]">{copy.kicker}</p>
            <h1 className="serif mt-2 text-3xl font-semibold sm:text-4xl">{sv ? "Portföljer" : "Portfolios"}</h1>
            <Card className="mt-8">
              <p className="text-sm text-[#c9d2df]">{copy.loginCopy}</p>
              <ButtonLink href="/auth/login?next=/portfolio" className="mt-4">{copy.login}</ButtonLink>
            </Card>
          </>
        ) : selectedState ? (
          <>
            <ButtonLink href="/portfolio" variant="ghost" className="-ml-3 w-fit"><ArrowLeft className="h-4 w-4" />{sv ? "Alla portföljer" : "All portfolios"}</ButtonLink>
            <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-[#e1cb95]">{sv ? "Portföljdetaljer" : "Portfolio details"}</p>
                <h1 className="serif mt-1 text-3xl font-semibold sm:text-4xl">{selectedState.portfolio.name}</h1>
                <p className="mt-2 text-sm text-[#9aa7b8]">{copy.baseCurrency}: {selectedState.portfolio.base_currency} · {selectedState.positions.length} {sv ? "aktiva positioner" : "active positions"}</p>
              </div>
              <form action={deletePortfolioAction}>
                <input type="hidden" name="id" value={selectedState.portfolio.id} />
                <Button variant="danger" className="min-h-11"><Trash2 className="h-4 w-4" />{copy.deletePortfolio}</Button>
              </form>
            </div>

            {feedback ? <p className="mt-5 rounded-lg border border-[#e1cb95]/20 bg-[#e1cb95]/5 p-3 text-sm text-[#e1cb95]" role="status">{feedback}</p> : null}
            {!transactionsAvailable || !snapshotsAvailable ? <div className="mt-5 rounded-lg border border-amber-300/20 bg-amber-950/20 p-3 text-sm text-amber-100"><AlertTriangle className="mr-2 inline h-4 w-4" />{sv ? "Portfolio 2.0-databasmigreringen saknas i den här miljön. Befintliga innehav visas, men delar av historiken aktiveras först efter migreringen." : "The Portfolio 2.0 database migration is missing in this environment. Existing holdings are shown, but parts of history activate after migration."}</div> : null}

            {selectedState.positions.length ? (
              <>
                <div className="mt-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <div className="rounded-xl border border-white/10 bg-[#07111f]/70 p-4"><p className="text-xs text-[#8f9bac]">{sv ? "Portföljvärde" : "Portfolio value"}</p><p className="mt-1 text-xl font-semibold">{money(selectedState.latest?.portfolio_value, selectedState.portfolio.base_currency, locale)}</p></div>
                  <div className="rounded-xl border border-white/10 bg-[#07111f]/70 p-4"><p className="text-xs text-[#8f9bac]">{sv ? "Investerat kapital" : "Invested capital"}</p><p className="mt-1 text-xl font-semibold">{money(selectedState.latest?.invested_capital, selectedState.portfolio.base_currency, locale)}</p></div>
                  <div className="rounded-xl border border-white/10 bg-[#07111f]/70 p-4"><p className="text-xs text-[#8f9bac]">{sv ? "Orealiserat P/L" : "Unrealized P/L"}</p><p className={`mt-1 text-xl font-semibold ${(numeric(selectedState.latest?.unrealized_pl) ?? 0) >= 0 ? "text-emerald-200" : "text-red-200"}`}>{money(selectedState.latest?.unrealized_pl, selectedState.portfolio.base_currency, locale)} <span className="text-xs">({percentage(selectedState.latest?.unrealized_pl_percent)})</span></p></div>
                  <div className="rounded-xl border border-[#e1cb95]/20 bg-[#e1cb95]/5 p-4"><p className="text-xs text-[#bba975]">StockBox Portfolio Score</p><p className="mt-1 text-xl font-semibold">{score(selectedState.latest?.portfolio_score)}<span className="text-xs text-[#8f9bac]">/100</span></p></div>
                </div>

                <div className="mt-5"><PortfolioAiCoach locale={locale} portfolios={aiPortfolioSummaries.filter((portfolio) => portfolio.id === selectedState.portfolio.id)} candidates={recentCandidates} /></div>
                <div className="mt-5"><PortfolioAnalyzer portfolioId={selectedState.portfolio.id} holdings={selectedState.analyzerHoldings} locale={locale} lastSnapshotAt={selectedState.latest?.created_at ?? null} /></div>

                {selectedState.latest ? (
                  <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                    {[{ label: sv ? "Risk" : "Risk", value: selectedState.latest.risk_score }, { label: sv ? "Värdering" : "Valuation", value: selectedState.latest.valuation_score }, { label: sv ? "Kvalitet" : "Quality", value: selectedState.latest.quality_score }, { label: sv ? "Tillväxt" : "Growth", value: selectedState.latest.growth_score }, { label: "Momentum", value: selectedState.latest.momentum_score }, { label: sv ? "Diversifiering" : "Diversification", value: selectedState.latest.diversification_score }].map((item) => <div key={item.label} className="rounded-lg border border-white/10 bg-white/[0.025] p-3"><p className="text-xs text-[#8f9bac]">{item.label}</p><p className="mt-1 font-semibold">{score(item.value)}</p></div>)}
                  </div>
                ) : null}

                {selectedState.concentration !== null && selectedState.concentration >= 0.35 ? <div className="mt-4 rounded-lg border border-amber-300/20 bg-amber-950/20 p-3 text-sm text-amber-100"><AlertTriangle className="mr-2 inline h-4 w-4" />{sv ? `${selectedState.summary?.largestPosition ?? "Största positionen"} är cirka ${(selectedState.concentration * 100).toFixed(1)} % av portföljen. StockBox AI flaggar detta som koncentrationsrisk att granska.` : `${selectedState.summary?.largestPosition ?? "The largest position"} is about ${(selectedState.concentration * 100).toFixed(1)}% of the portfolio. StockBox AI flags this as concentration risk to review.`}</div> : null}

                {selectedState.realizedPerformance.complete && selectedState.realizedPerformance.byCurrency.length ? (
                  <Card className="mt-5">
                    <h2 className="font-semibold">{sv ? "Realiserat P/L" : "Realized P/L"}</h2>
                    <p className="mt-1 text-xs text-[#7f8b9b]">{sv ? "Visas separat per transaktionsvaluta. StockBox blandar inte valutor utan verifierad FX." : "Shown separately by transaction currency. StockBox does not mix currencies without verified FX."}</p>
                    <div className="mt-3 flex flex-wrap gap-2">{selectedState.realizedPerformance.byCurrency.map((item) => <div key={item.currency} className="rounded-md border border-white/10 bg-[#07111f]/70 px-3 py-2"><span className="text-xs text-[#8f9bac]">{item.currency}</span><p className={`mt-1 font-semibold ${item.realizedProfitLoss >= 0 ? "text-emerald-200" : "text-red-200"}`}>{money(item.realizedProfitLoss, item.currency, locale)}</p></div>)}</div>
                  </Card>
                ) : !selectedState.realizedPerformance.complete ? <div className="mt-5 rounded-lg border border-amber-300/20 bg-amber-950/20 p-3 text-sm text-amber-100"><AlertTriangle className="mr-2 inline h-4 w-4" />{sv ? "Realiserat P/L döljs eftersom transaktionshistoriken innehåller en ogiltig köp-/säljsekvens." : "Realized P/L is hidden because transaction history contains an invalid buy/sell sequence."}</div> : null}

                <div className="mt-7">
                  <div className="flex flex-wrap items-end justify-between gap-2"><div><h2 className="text-lg font-semibold text-[#f4efe5]">{sv ? "Positioner" : "Positions"}</h2><p className="mt-1 text-xs text-[#8f9bac]">{sv ? "Full positionsdata, marknadsläge och senaste StockBox-signaler." : "Full position data, market state and latest StockBox signals."}</p></div>{selectedState.latest ? <p className="text-xs text-[#7f8b9b]">{sv ? "Priser uppdaterade" : "Prices updated"}: {dateTime(selectedState.latest.prices_updated_at, locale)}</p> : null}</div>
                  <div className="mt-3 grid gap-3 xl:grid-cols-2">
                    {selectedState.positions.map((position) => {
                      const analysisRows = analysisHistory.get(position.ticker) ?? [];
                      const latestAnalysis = analysisRows[0];
                      const previousAnalysis = analysisRows[1];
                      const currentReport = latestAnalysis?.report;
                      const currentScore = numeric(latestAnalysis?.score) ?? currentReport?.score.score ?? null;
                      const priorScore = numeric(previousAnalysis?.score) ?? previousAnalysis?.report?.score.score ?? null;
                      const scoreDelta = currentScore !== null && priorScore !== null ? currentScore - priorScore : null;
                      const snapshotPosition = selectedState.snapshotHoldings.find((item) => item.ticker === position.ticker && item.currency === position.currency) ?? selectedState.snapshotHoldings.find((item) => item.ticker === position.ticker);
                      const currentPrice = snapshotPosition?.currentPrice ?? currentReport?.market?.price ?? null;
                      const marketCurrency = snapshotPosition?.marketCurrency ?? currentReport?.market?.currency ?? position.currency;
                      const nativeValue = currentPrice !== null && marketCurrency === position.currency ? currentPrice * position.quantity : null;
                      const nativePl = nativeValue !== null ? nativeValue - position.costBasis : null;
                      const plBase = snapshotPosition?.unrealizedProfitLossBase ?? null;
                      const displayPl = plBase ?? nativePl;
                      const displayPlCurrency = plBase !== null ? selectedState.portfolio.base_currency : position.currency;
                      const weight = snapshotPosition?.weight ?? null;
                      const recommendation = latestAnalysis?.recommendation ?? currentReport?.recommendation ?? null;
                      const dims = [[sv ? "Värdering" : "Valuation", dimension(currentReport, "valuation")], [sv ? "Tillväxt" : "Growth", dimension(currentReport, "growth")], [sv ? "Lönsamhet" : "Profitability", dimension(currentReport, "profitability")], [sv ? "Finansiell hälsa" : "Financial health", dimension(currentReport, "financialHealth")], [sv ? "Kvalitet" : "Quality", dimension(currentReport, "quality")], [sv ? "Risk" : "Risk", dimension(currentReport, "risk")], ["Momentum", dimension(currentReport, "momentum")]] as const;
                      return (
                        <div key={`${position.ticker}-${position.currency}`} className="rounded-xl border border-white/10 bg-[#0b1829] p-4">
                          <div className="flex items-start justify-between gap-3"><div><p className="font-mono text-sm font-semibold text-[#e1cb95]">{position.ticker}</p><p className="mt-1 text-xs text-[#8f9bac]">{position.quantity.toLocaleString(locale === "sv" ? "sv-SE" : "en-GB", { maximumFractionDigits: 6 })} {sv ? "aktier" : "shares"} · {position.currency}</p></div>{recommendation ? <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${recommendationTone(recommendation)}`}>{recommendation}</span> : null}</div>
                          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4"><div><p className="text-[11px] text-[#7f8b9b]">{sv ? "Snittpris" : "Avg. cost"}</p><p className="mt-1 text-sm font-semibold">{money(position.averagePurchasePrice, position.currency, locale)}</p></div><div><p className="text-[11px] text-[#7f8b9b]">{sv ? "Nuvarande pris" : "Current price"}</p><p className="mt-1 text-sm font-semibold">{money(currentPrice, marketCurrency, locale)}</p></div><div><p className="text-[11px] text-[#7f8b9b]">P/L</p><p className={`mt-1 text-sm font-semibold ${(displayPl ?? 0) >= 0 ? "text-emerald-200" : "text-red-200"}`}>{money(displayPl, displayPlCurrency, locale)}</p></div><div><p className="text-[11px] text-[#7f8b9b]">{sv ? "Vikt" : "Weight"}</p><p className="mt-1 text-sm font-semibold">{weight === null ? "—" : `${(weight * 100).toFixed(1)}%`}</p></div></div>
                          <div className="mt-4 flex flex-wrap items-center gap-2"><div className="rounded-lg border border-[#e1cb95]/20 bg-[#e1cb95]/5 px-3 py-2"><span className="text-xs text-[#bba975]">Score</span><span className="ml-2 font-semibold">{currentScore === null ? "—" : Math.round(currentScore)}</span>{scoreDelta !== null ? <span className={`ml-2 text-xs ${scoreDelta >= 0 ? "text-emerald-200" : "text-red-200"}`}>{scoreDelta >= 0 ? "+" : ""}{scoreDelta.toFixed(1)}</span> : null}</div><span className="text-xs text-[#7f8b9b]">{sv ? "Analys" : "Analysis"}: {dateTime(latestAnalysis?.created_at, locale)}</span></div>
                          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">{dims.map(([label, value]) => <div key={label} className="rounded-md bg-white/[0.035] p-2"><p className="truncate text-[10px] text-[#7f8b9b]">{label}</p><p className="mt-1 text-xs font-semibold">{value === null ? "—" : Math.round(value)}</p></div>)}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-7 grid gap-5 xl:grid-cols-2">
                  <Card>
                    <h2 className="font-semibold">{sv ? "Lägg till ett nytt köp" : "Add another purchase"}</h2>
                    <p className="mt-2 text-xs leading-5 text-[#9aa7b8]">{sv ? "Sökningen rensas efter ett lyckat köp. På den här detaljsidan är aktuell portfölj låst som val." : "Search clears after a successful purchase. On this detail page the current portfolio is the only selection."}</p>
                    <PortfolioPurchaseForm portfolios={[{ id: selectedState.portfolio.id, name: selectedState.portfolio.name, baseCurrency: selectedState.portfolio.base_currency }]} locale={locale} today={today} />
                  </Card>
                  <Card>
                    <h2 className="font-semibold">{sv ? "Registrera en försäljning" : "Record a sale"}</h2>
                    <p className="mt-2 text-xs leading-5 text-[#9aa7b8]">{sv ? "StockBox tillåter aldrig att fler aktier säljs än positionen äger." : "StockBox never allows more shares to be sold than the position owns."}</p>
                    <form action={sellHoldingAction} className="mt-4 grid gap-2 sm:grid-cols-2">
                      <input type="hidden" name="portfolioId" value={selectedState.portfolio.id} />
                      <input name="ticker" required maxLength={16} placeholder={copy.ticker} aria-label={copy.ticker} className="h-11 rounded-md border border-white/12 bg-[#07111f] px-3 uppercase" />
                      <input name="quantity" required type="number" min="0.000001" step="any" placeholder={sv ? "Antal att sälja" : "Quantity to sell"} aria-label={sv ? "Antal att sälja" : "Quantity to sell"} className="h-11 rounded-md border border-white/12 bg-[#07111f] px-3" />
                      <input name="salePrice" required type="number" min="0" step="any" placeholder={sv ? "Säljpris per aktie" : "Sale price per share"} aria-label={sv ? "Säljpris per aktie" : "Sale price per share"} className="h-11 rounded-md border border-white/12 bg-[#07111f] px-3" />
                      <input name="saleDate" required type="date" max={today} defaultValue={today} aria-label={sv ? "Säljdatum" : "Sale date"} className="h-11 rounded-md border border-white/12 bg-[#07111f] px-3" />
                      <input name="currency" required defaultValue="SEK" maxLength={3} pattern="[A-Za-z]{3}" aria-label={copy.currency} className="h-11 rounded-md border border-white/12 bg-[#07111f] px-3 uppercase" />
                      <input name="fees" type="number" min="0" step="any" defaultValue="0" aria-label={sv ? "Avgift" : "Fee"} placeholder={sv ? "Avgift" : "Fee"} className="h-11 rounded-md border border-white/12 bg-[#07111f] px-3" />
                      <Button className="min-h-11 sm:col-span-2">{sv ? "Registrera försäljning" : "Record sale"}</Button>
                    </form>
                  </Card>
                </div>

                <div className="mt-7 border-t border-white/10 pt-6">
                  <h2 className="text-lg font-semibold text-[#f4efe5]">{sv ? "Köp- och transaktionshistorik" : "Purchase and transaction history"}</h2>
                  <p className="mt-1 text-xs leading-5 text-[#8f9bac]">{sv ? "Varje köp är en egen rad. Ändringar räknar om positionens cost basis från hela transaktionskedjan." : "Every purchase is its own row. Changes rebuild position cost basis from the complete transaction chain."}</p>
                  {transactionsAvailable && selectedState.portfolioTransactions.length ? (
                    <div className="mt-3 grid gap-2">
                      {selectedState.portfolioTransactions.slice(0, 30).map((transaction) => (
                        <div key={transaction.id} className="rounded-lg border border-white/10 bg-white/[0.025] p-3">
                          {transaction.transaction_type === "buy" || transaction.transaction_type === "sell" ? (
                            <div className="flex flex-col gap-2 lg:flex-row lg:items-end">
                              <div className="flex min-w-28 items-center gap-2 pb-2 lg:pb-2.5"><span className={`rounded px-2 py-1 text-[10px] font-semibold uppercase ${transaction.transaction_type === "buy" ? "bg-emerald-950/50 text-emerald-200" : "bg-red-950/50 text-red-200"}`}>{transaction.transaction_type}</span><span className="font-mono text-sm font-semibold text-[#e1cb95]">{transaction.ticker}</span></div>
                              <form action={updatePortfolioTransactionAction} className="grid min-w-0 flex-1 grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                                <input type="hidden" name="id" value={transaction.id} />
                                <label className="text-[10px] text-[#7f8b9b]">{sv ? "Antal" : "Quantity"}<input name="quantity" required type="number" min="0.000001" step="any" defaultValue={numeric(transaction.quantity) ?? undefined} className="mt-1 h-10 w-full rounded-md border border-white/12 bg-[#07111f] px-2 text-sm text-[#f4efe5]" /></label>
                                <label className="text-[10px] text-[#7f8b9b]">{sv ? "Pris" : "Price"}<input name="price" required type="number" min="0" step="any" defaultValue={numeric(transaction.price) ?? undefined} className="mt-1 h-10 w-full rounded-md border border-white/12 bg-[#07111f] px-2 text-sm text-[#f4efe5]" /></label>
                                <label className="text-[10px] text-[#7f8b9b]">{sv ? "Datum" : "Date"}<input name="purchaseDate" required type="date" max={today} defaultValue={transaction.executed_at} className="mt-1 h-10 w-full rounded-md border border-white/12 bg-[#07111f] px-2 text-sm text-[#f4efe5]" /></label>
                                <label className="text-[10px] text-[#7f8b9b]">{sv ? "Valuta" : "Currency"}<input name="currency" required maxLength={3} pattern="[A-Za-z]{3}" defaultValue={transaction.currency} className="mt-1 h-10 w-full rounded-md border border-white/12 bg-[#07111f] px-2 text-sm uppercase text-[#f4efe5]" /></label>
                                <label className="text-[10px] text-[#7f8b9b]">{sv ? "Avgift" : "Fee"}<input name="fees" type="number" min="0" step="any" defaultValue={numeric(transaction.fees) ?? 0} className="mt-1 h-10 w-full rounded-md border border-white/12 bg-[#07111f] px-2 text-sm text-[#f4efe5]" /></label>
                                <Button className="min-h-10 sm:col-span-3 lg:col-span-5 lg:justify-self-start"><Save className="h-4 w-4" />{sv ? "Spara transaktion" : "Save transaction"}</Button>
                              </form>
                              <form action={removePortfolioTransactionAction}><input type="hidden" name="id" value={transaction.id} /><Button variant="ghost" className="min-h-10" title={sv ? "Ta bort transaktion" : "Delete transaction"}><Trash2 className="h-4 w-4" /><span className="sr-only">{sv ? "Ta bort" : "Delete"} {transaction.ticker}</span></Button></form>
                            </div>
                          ) : <div className="flex items-center justify-between gap-3 text-sm"><span><span className="mr-2 rounded bg-white/8 px-2 py-1 text-[10px] uppercase">{transaction.transaction_type}</span><strong>{transaction.ticker}</strong> · {money(transaction.cash_amount, transaction.currency, locale)} · {transaction.executed_at}</span><form action={removePortfolioTransactionAction}><input type="hidden" name="id" value={transaction.id} /><Button variant="ghost" className="min-h-10"><Trash2 className="h-4 w-4" /><span className="sr-only">{sv ? "Ta bort" : "Delete"}</span></Button></form></div>}
                        </div>
                      ))}
                    </div>
                  ) : <p className="mt-3 text-sm text-[#7f8b9b]">{transactionsAvailable ? (sv ? "Ingen transaktionshistorik ännu." : "No transaction history yet.") : (sv ? "Historiken aktiveras efter databasmigreringen." : "History activates after the database migration.")}</p>}
                </div>

                <div className="mt-7 border-t border-white/10 pt-6">
                  <div className="flex flex-wrap items-end justify-between gap-2"><div><h2 className="text-lg font-semibold text-[#f4efe5]">{sv ? "Portföljhistorik" : "Portfolio history"}</h2><p className="mt-1 text-xs text-[#8f9bac]">{sv ? "Varje helportföljanalys sparar en snapshot för senare trendjämförelser." : "Every whole-portfolio analysis saves a snapshot for later trend comparisons."}</p></div>{selectedState.summary?.strongestHolding || selectedState.summary?.weakestHolding ? <p className="text-xs text-[#8f9bac]">{sv ? "Starkast" : "Strongest"}: <strong className="text-[#c9d2df]">{selectedState.summary.strongestHolding ?? "—"}</strong> · {sv ? "Svagast" : "Weakest"}: <strong className="text-[#c9d2df]">{selectedState.summary.weakestHolding ?? "—"}</strong></p> : null}</div>
                  {selectedState.history.length ? <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{selectedState.history.map((snapshot) => <div key={snapshot.id} className="rounded-lg border border-white/10 bg-white/[0.025] p-3"><div className="flex items-center justify-between gap-2"><span className="inline-flex items-center gap-1.5 text-xs text-[#8f9bac]"><CalendarDays className="h-3.5 w-3.5" />{dateTime(snapshot.created_at, locale)}</span>{(numeric(snapshot.unrealized_pl) ?? 0) >= 0 ? <TrendingUp className="h-4 w-4 text-emerald-200" /> : <TrendingDown className="h-4 w-4 text-red-200" />}</div><div className="mt-3 grid grid-cols-3 gap-2"><div><p className="text-[10px] text-[#6f7b8c]">{sv ? "Värde" : "Value"}</p><p className="mt-1 text-xs font-semibold">{money(snapshot.portfolio_value, snapshot.base_currency, locale)}</p></div><div><p className="text-[10px] text-[#6f7b8c]">Score</p><p className="mt-1 text-xs font-semibold">{score(snapshot.portfolio_score)}</p></div><div><p className="text-[10px] text-[#6f7b8c]">Risk</p><p className="mt-1 text-xs font-semibold">{score(snapshot.risk_score)}</p></div></div>{snapshot.failures?.length ? <p className="mt-2 text-[10px] text-amber-200">{snapshot.failures.length} {sv ? "datavarningar" : "data warnings"}</p> : null}</div>)}</div> : <p className="mt-3 text-sm text-[#7f8b9b]">{snapshotsAvailable ? (sv ? "Kör din första portföljanalys för att skapa historik." : "Run your first portfolio analysis to create history.") : (sv ? "Historik aktiveras efter databasmigreringen." : "History activates after the database migration.")}</p>}
                </div>
              </>
            ) : (
              <Card className="mt-7 text-center"><BriefcaseBusiness className="mx-auto h-8 w-8 text-[#e1cb95]" /><h2 className="mt-3 font-semibold">{sv ? "Portföljen är tom" : "This portfolio is empty"}</h2><p className="mx-auto mt-2 max-w-lg text-sm text-[#8f9bac]">{sv ? "Lägg till ditt första köp nedan. StockBox kan därefter analysera portföljen och ge AI-feedback." : "Add your first purchase below. StockBox can then analyze the portfolio and provide AI feedback."}</p><div className="mx-auto mt-5 max-w-3xl text-left"><PortfolioPurchaseForm portfolios={[{ id: selectedState.portfolio.id, name: selectedState.portfolio.name, baseCurrency: selectedState.portfolio.base_currency }]} locale={locale} today={today} /></div></Card>
            )}
          </>
        ) : (
          <>
            <p className="text-sm font-semibold text-[#e1cb95]">{copy.kicker}</p>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div><h1 className="serif mt-2 text-3xl font-semibold sm:text-4xl">{sv ? "Dina portföljer" : "Your portfolios"}</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-[#9aa7b8]">{sv ? "Översikten visar bara det viktigaste. Öppna en portfölj för positioner, transaktioner, historik, full analys och djupare AI-feedback." : "The overview shows only what matters most. Open a portfolio for positions, transactions, history, full analysis and deeper AI feedback."}</p></div>
            </div>

            {feedback ? <p className="mt-5 rounded-lg border border-[#e1cb95]/20 bg-[#e1cb95]/5 p-3 text-sm text-[#e1cb95]" role="status">{feedback}</p> : null}
            {!transactionsAvailable || !snapshotsAvailable ? <div className="mt-5 rounded-lg border border-amber-300/20 bg-amber-950/20 p-3 text-sm text-amber-100"><AlertTriangle className="mr-2 inline h-4 w-4" />{sv ? "Portfolio 2.0-databasmigreringen saknas i den här miljön. Befintliga innehav visas utan att förstöras." : "The Portfolio 2.0 database migration is missing in this environment. Existing holdings remain visible."}</div> : null}

            <div className="mt-8"><PortfolioAiCoach locale={locale} portfolios={aiPortfolioSummaries} candidates={recentCandidates} /></div>

            <div className="mt-6 grid gap-5 xl:grid-cols-[.8fr_1.2fr]">
              <Card>
                <h2 className="font-semibold">{copy.createPortfolio}</h2>
                <p className="mt-2 text-xs leading-5 text-[#9aa7b8]">{sv ? "Skapa en separat portfölj för ett annat mål, konto eller strategi." : "Create a separate portfolio for another goal, account or strategy."}</p>
                <form action={createPortfolioAction} className="mt-4 grid gap-2 sm:grid-cols-[1fr_96px_auto]">
                  <label className="sr-only" htmlFor="portfolio-name">{copy.portfolioName}</label>
                  <input id="portfolio-name" name="name" required maxLength={80} placeholder={copy.namePlaceholder} className="h-11 min-w-0 rounded-md border border-white/12 bg-[#07111f] px-3" />
                  <label className="sr-only" htmlFor="portfolio-currency">{copy.baseCurrency}</label>
                  <input id="portfolio-currency" name="baseCurrency" required defaultValue="SEK" maxLength={3} pattern="[A-Za-z]{3}" aria-label={copy.baseCurrency} className="h-11 rounded-md border border-white/12 bg-[#07111f] px-3 uppercase" />
                  <Button className="min-h-11"><Plus className="h-4 w-4" />{copy.create}</Button>
                </form>
              </Card>
              <Card>
                <div className="flex items-start justify-between gap-3"><div><h2 className="font-semibold">{sv ? "Lägg till ett köp" : "Add a purchase"}</h2><p className="mt-2 text-xs leading-5 text-[#9aa7b8]">{sv ? "Sök bolaget, välj portfölj och registrera köpet. Portföljvalet ligger kvar efteråt medan bolagssökningen rensas." : "Search the company, choose a portfolio and record the purchase. The portfolio selection stays while company search clears afterward."}</p></div><Sparkles className="h-5 w-5 shrink-0 text-[#e1cb95]" /></div>
                <PortfolioPurchaseForm portfolios={portfolioOptions} locale={locale} today={today} />
              </Card>
            </div>

            <div className="mt-8 flex items-center justify-between gap-3"><div><h2 className="text-lg font-semibold text-[#f4efe5]">{sv ? "Portföljöversikt" : "Portfolio overview"}</h2><p className="mt-1 text-xs text-[#8f9bac]">{sv ? "Endast kärninformationen visas här." : "Only core information is shown here."}</p></div><span className="text-xs text-[#7f8b9b]">{portfolios.length} {sv ? "portföljer" : "portfolios"}</span></div>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              {portfolioStates.length ? portfolioStates.map((state) => {
                const pl = numeric(state.latest?.unrealized_pl);
                const portfolioScore = numeric(state.latest?.portfolio_score);
                const diversification = numeric(state.latest?.diversification_score);
                const aiObservation = state.concentration !== null && state.concentration >= 0.35
                  ? (sv ? `AI: ${state.summary?.largestPosition ?? "Största positionen"} väger ${(state.concentration * 100).toFixed(0)} % – granska koncentrationen.` : `AI: ${state.summary?.largestPosition ?? "Largest position"} is ${(state.concentration * 100).toFixed(0)}% – review concentration.`)
                  : diversification !== null && diversification < 60
                    ? (sv ? `AI: diversifieringen är ${Math.round(diversification)}/100 och kan förbättras.` : `AI: diversification is ${Math.round(diversification)}/100 and can improve.`)
                    : state.latest
                      ? (sv ? "AI: inga akuta strukturvarningar i senaste snapshoten." : "AI: no urgent structural warnings in the latest snapshot.")
                      : (sv ? "AI: analysera portföljen för score, risk och förbättringsförslag." : "AI: analyze the portfolio for score, risk and improvement ideas.");
                return (
                  <Card key={state.portfolio.id} className="group p-4 transition hover:border-[#e1cb95]/25 sm:p-5">
                    <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#e1cb95]">{sv ? "Portfölj" : "Portfolio"}</p><h3 className="mt-1 text-xl font-semibold text-[#f4efe5]">{state.portfolio.name}</h3><p className="mt-1 text-xs text-[#8f9bac]">{state.positions.length} {sv ? "positioner" : "positions"} · {state.portfolio.base_currency}</p></div><BriefcaseBusiness className="h-5 w-5 text-[#6f7b8c] transition group-hover:text-[#e1cb95]" /></div>
                    <div className="mt-4 grid grid-cols-3 gap-2"><div className="rounded-lg bg-white/[0.035] p-3"><p className="text-[10px] text-[#7f8b9b]">{sv ? "Värde" : "Value"}</p><p className="mt-1 truncate text-sm font-semibold">{money(state.latest?.portfolio_value, state.portfolio.base_currency, locale)}</p></div><div className="rounded-lg bg-white/[0.035] p-3"><p className="text-[10px] text-[#7f8b9b]">P/L</p><p className={`mt-1 text-sm font-semibold ${(pl ?? 0) >= 0 ? "text-emerald-200" : "text-red-200"}`}>{percentage(state.latest?.unrealized_pl_percent)}</p></div><div className="rounded-lg border border-[#e1cb95]/15 bg-[#e1cb95]/5 p-3"><p className="text-[10px] text-[#bba975]">Score</p><p className="mt-1 text-sm font-semibold">{portfolioScore === null ? "—" : Math.round(portfolioScore)}</p></div></div>
                    <p className="mt-3 rounded-lg border border-white/8 bg-black/10 px-3 py-2 text-xs leading-5 text-[#9aa7b8]">{aiObservation}</p>
                    <ButtonLink href={`/portfolio?portfolio=${encodeURIComponent(state.portfolio.id)}`} variant="secondary" className="mt-4 w-full justify-between">{sv ? "Öppna portfölj" : "Open portfolio"}<ChevronRight className="h-4 w-4" /></ButtonLink>
                  </Card>
                );
              }) : <Card className="lg:col-span-2 text-center"><BriefcaseBusiness className="mx-auto h-8 w-8 text-[#e1cb95]" /><h2 className="mt-3 font-semibold">{copy.noPortfolios}</h2><p className="mt-2 text-sm text-[#9aa7b8]">{copy.emptyCopy}</p></Card>}
            </div>
          </>
        )}
      </Container>
    </Section>
  );
}
