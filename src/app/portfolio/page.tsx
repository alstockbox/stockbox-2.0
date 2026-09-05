import type { Metadata } from "next";
import { AlertTriangle, BriefcaseBusiness, CalendarDays, Plus, Save, Trash2, TrendingDown, TrendingUp } from "lucide-react";
import type { AnalysisReport } from "@/lib/analysis/types";
import { PortfolioAnalyzer } from "@/components/portfolio/portfolio-analyzer";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, Container, Section } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth/session";
import { getP0Copy } from "@/lib/i18n/p0-copy";
import { getLocale } from "@/lib/i18n/server";
import { buildPortfolioPositions, type PortfolioTransactionInput } from "@/lib/portfolio/portfolio-math";
import { createClient } from "@/lib/supabase/server";
import {
  addHoldingAction,
  createPortfolioAction,
  deletePortfolioAction,
  removePortfolioTransactionAction,
  updatePortfolioTransactionAction,
} from "@/lib/workspace/actions";

export const metadata: Metadata = { title: "Portfolio" };

type PageProps = { searchParams: Promise<{ limit?: string; error?: string }> };
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

  const tickers = [...new Set(holdings.map((holding) => holding.ticker.trim().toUpperCase()))];
  const analysisResult = supabase && tickers.length
    ? await supabase.from("analyses").select("id,ticker,created_at,score,recommendation,report").eq("user_id", user?.id ?? "").in("ticker", tickers).order("created_at", { ascending: false })
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

  const feedback = params.limit
    ? copy.limit
    : params.error === "transaction_input"
      ? (sv ? "Kontrollera antal, pris, datum, avgift och valuta." : "Check quantity, price, date, fee and currency.")
      : params.error === "transaction_save"
        ? (sv ? "Transaktionen kunde inte sparas. Kontrollera innehavet och försök igen." : "The transaction could not be saved. Check the position and try again.")
        : params.error === "transaction_delete"
          ? (sv ? "Transaktionen kunde inte tas bort." : "The transaction could not be deleted.")
          : params.error
            ? copy.error
            : null;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <Section className="pb-10 pt-8 sm:pt-10">
      <Container>
        <p className="text-sm font-semibold text-[#e1cb95]">{copy.kicker}</p>
        <h1 className="serif mt-2 text-3xl font-semibold sm:text-4xl">{sv ? "Din riktiga portfölj, inte bara en tickerlista" : "Your actual portfolio, not just a ticker list"}</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-[#9aa7b8]">{sv ? "Registrera varje köp med antal, pris och datum. StockBox räknar cost basis, kopplar dina senaste analyser till positionerna och sparar snapshots så att du kan följa portföljens utveckling över tid." : "Record each purchase with quantity, price and date. StockBox calculates cost basis, connects your latest research to each position and saves snapshots so you can follow the portfolio over time."}</p>

        {!user ? (
          <Card className="mt-8">
            <p className="text-sm text-[#c9d2df]">{copy.loginCopy}</p>
            <ButtonLink href="/auth/login?next=/portfolio" className="mt-4">{copy.login}</ButtonLink>
          </Card>
        ) : (
          <>
            {feedback ? <p className="mt-5 rounded-lg border border-[#e1cb95]/20 bg-[#e1cb95]/5 p-3 text-sm text-[#e1cb95]" role="status">{feedback}</p> : null}
            {!transactionsAvailable || !snapshotsAvailable ? (
              <div className="mt-5 rounded-lg border border-amber-300/20 bg-amber-950/20 p-3 text-sm text-amber-100" role="status">
                <AlertTriangle className="mr-2 inline h-4 w-4" />{sv ? "Portfolio 2.0-databasmigreringen är inte installerad i den här miljön ännu. Befintliga innehav visas utan att förstöras, men transaktionshistorik/snapshots aktiveras först efter migreringen." : "The Portfolio 2.0 database migration is not installed in this environment yet. Existing holdings remain visible, but transaction history and snapshots activate after migration."}
              </div>
            ) : null}

            <div className="mt-8 grid gap-5 xl:grid-cols-[.8fr_1.2fr]">
              <Card>
                <h2 className="font-semibold">{copy.createPortfolio}</h2>
                <p className="mt-2 text-xs leading-5 text-[#9aa7b8]">{sv ? "Basvalutan används för totalsummor. FX måste finnas för att olika valutor ska få summeras." : "The base currency is used for totals. FX must be available before different currencies are combined."}</p>
                <form action={createPortfolioAction} className="mt-4 grid gap-2 sm:grid-cols-[1fr_96px_auto]">
                  <label className="sr-only" htmlFor="portfolio-name">{copy.portfolioName}</label>
                  <input id="portfolio-name" name="name" required maxLength={80} placeholder={copy.namePlaceholder} className="h-11 min-w-0 rounded-md border border-white/12 bg-[#07111f] px-3" />
                  <label className="sr-only" htmlFor="portfolio-currency">{copy.baseCurrency}</label>
                  <input id="portfolio-currency" name="baseCurrency" required defaultValue="SEK" maxLength={3} pattern="[A-Za-z]{3}" aria-label={copy.baseCurrency} className="h-11 rounded-md border border-white/12 bg-[#07111f] px-3 uppercase" />
                  <Button className="min-h-11"><Plus className="h-4 w-4" aria-hidden="true" />{copy.create}</Button>
                </form>
              </Card>

              <Card>
                <h2 className="font-semibold">{sv ? "Registrera ett köp" : "Record a purchase"}</h2>
                <p className="mt-2 text-xs leading-5 text-[#9aa7b8]">{sv ? "Flera köp i samma aktie sparas separat och räknas ihop till korrekt genomsnittligt inköpspris." : "Multiple purchases of the same stock are stored separately and combined into the correct average purchase price."}</p>
                {portfolios.length ? (
                  <form action={addHoldingAction} className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    <select name="portfolioId" required aria-label={copy.portfolio} className="h-11 rounded-md border border-white/12 bg-[#07111f] px-3">
                      {portfolios.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                    </select>
                    <input name="ticker" required maxLength={16} placeholder={copy.ticker} aria-label={copy.ticker} className="h-11 rounded-md border border-white/12 bg-[#07111f] px-3 uppercase" />
                    <input name="quantity" required type="number" min="0.000001" step="any" placeholder={copy.quantity} aria-label={copy.quantity} className="h-11 rounded-md border border-white/12 bg-[#07111f] px-3" />
                    <input name="averageCost" required type="number" min="0" step="any" placeholder={sv ? "Pris per aktie" : "Price per share"} aria-label={sv ? "Pris per aktie" : "Price per share"} className="h-11 rounded-md border border-white/12 bg-[#07111f] px-3" />
                    <input name="purchaseDate" required type="date" max={today} defaultValue={today} aria-label={sv ? "Inköpsdatum" : "Purchase date"} className="h-11 rounded-md border border-white/12 bg-[#07111f] px-3" />
                    <div className="grid grid-cols-[1fr_1.2fr] gap-2"><input name="currency" required defaultValue="SEK" maxLength={3} pattern="[A-Za-z]{3}" aria-label={copy.currency} className="h-11 rounded-md border border-white/12 bg-[#07111f] px-3 uppercase" /><input name="fees" type="number" min="0" step="any" defaultValue="0" aria-label={sv ? "Avgift" : "Fee"} placeholder={sv ? "Avgift" : "Fee"} className="h-11 rounded-md border border-white/12 bg-[#07111f] px-3" /></div>
                    <Button className="min-h-11 sm:col-span-2 xl:col-span-3"><Plus className="h-4 w-4" aria-hidden="true" />{sv ? "Lägg till köp" : "Add purchase"}</Button>
                  </form>
                ) : <p className="mt-3 text-sm text-[#9aa7b8]">{copy.createFirst}</p>}
              </Card>
            </div>

            <div className="mt-7 grid gap-6">
              {portfolios.length ? portfolios.map((portfolio) => {
                const portfolioHoldings = holdings.filter((holding) => holding.portfolio_id === portfolio.id);
                const portfolioTransactions = transactions.filter((transaction) => transaction.portfolio_id === portfolio.id);
                const transactionInputs: PortfolioTransactionInput[] = transactionsAvailable
                  ? portfolioTransactions.map((row) => ({ id: row.id, ticker: row.ticker, type: row.transaction_type, quantity: numeric(row.quantity), price: numeric(row.price), cashAmount: numeric(row.cash_amount), fees: numeric(row.fees), currency: row.currency, executedAt: row.executed_at }))
                  : portfolioHoldings.map((holding) => ({ id: holding.id, ticker: holding.ticker, type: "buy", quantity: numeric(holding.quantity), price: numeric(holding.average_cost), fees: 0, currency: holding.currency, executedAt: holding.acquired_at ?? holding.created_at.slice(0, 10) }));
                const positions = buildPortfolioPositions(transactionInputs);
                const latest = latestSnapshot.get(portfolio.id) ?? null;
                const history = snapshots.filter((snapshot) => snapshot.portfolio_id === portfolio.id).slice(0, 10);
                const snapshotHoldings = Array.isArray(latest?.holdings) ? latest.holdings : [];
                const summary = latest?.analysis_summary ?? null;
                const concentration = typeof summary?.largestPositionWeight === "number" ? summary.largestPositionWeight : null;
                const analyzerHoldings = positions.map((position) => ({ ticker: position.ticker, lastAnalysisAt: analysisHistory.get(position.ticker)?.[0]?.created_at ?? null }));

                return (
                  <Card key={portfolio.id} className="p-4 sm:p-6">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#e1cb95]">{sv ? "Portfölj" : "Portfolio"}</p>
                        <h2 className="mt-1 text-2xl font-semibold text-[#f4efe5]">{portfolio.name}</h2>
                        <p className="mt-1 text-xs text-[#9aa7b8]">{copy.baseCurrency}: {portfolio.base_currency} · {positions.length} {sv ? "aktiva positioner" : "active positions"}</p>
                      </div>
                      <form action={deletePortfolioAction}>
                        <input type="hidden" name="id" value={portfolio.id} />
                        <Button variant="ghost" className="min-h-11" title={copy.deletePortfolio}><Trash2 className="h-4 w-4" aria-hidden="true" />{copy.deletePortfolio}</Button>
                      </form>
                    </div>

                    {positions.length ? (
                      <>
                        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
                          <div className="rounded-lg border border-white/10 bg-[#07111f]/70 p-3"><p className="text-xs text-[#8f9bac]">{sv ? "Portföljvärde" : "Portfolio value"}</p><p className="mt-1 text-lg font-semibold">{money(latest?.portfolio_value, portfolio.base_currency, locale)}</p></div>
                          <div className="rounded-lg border border-white/10 bg-[#07111f]/70 p-3"><p className="text-xs text-[#8f9bac]">{sv ? "Investerat kapital" : "Invested capital"}</p><p className="mt-1 text-lg font-semibold">{money(latest?.invested_capital, portfolio.base_currency, locale)}</p></div>
                          <div className="rounded-lg border border-white/10 bg-[#07111f]/70 p-3"><p className="text-xs text-[#8f9bac]">{sv ? "Orealiserat P/L" : "Unrealized P/L"}</p><p className={`mt-1 text-lg font-semibold ${(numeric(latest?.unrealized_pl) ?? 0) >= 0 ? "text-emerald-200" : "text-red-200"}`}>{money(latest?.unrealized_pl, portfolio.base_currency, locale)} <span className="text-xs">({percentage(latest?.unrealized_pl_percent)})</span></p></div>
                          <div className="rounded-lg border border-[#e1cb95]/20 bg-[#e1cb95]/5 p-3"><p className="text-xs text-[#bba975]">StockBox Portfolio Score</p><p className="mt-1 text-lg font-semibold text-[#f4efe5]">{score(latest?.portfolio_score)}<span className="text-xs text-[#8f9bac]">/100</span></p></div>
                        </div>

                        <PortfolioAnalyzer portfolioId={portfolio.id} holdings={analyzerHoldings} locale={locale} lastSnapshotAt={latest?.created_at ?? null} />

                        {latest ? (
                          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                            {[{ label: sv ? "Risk" : "Risk", value: latest.risk_score }, { label: sv ? "Värdering" : "Valuation", value: latest.valuation_score }, { label: sv ? "Kvalitet" : "Quality", value: latest.quality_score }, { label: sv ? "Tillväxt" : "Growth", value: latest.growth_score }, { label: "Momentum", value: latest.momentum_score }, { label: sv ? "Diversifiering" : "Diversification", value: latest.diversification_score }].map((item) => <div key={item.label} className="rounded-lg border border-white/10 bg-white/[0.025] p-3"><p className="text-xs text-[#8f9bac]">{item.label}</p><p className="mt-1 font-semibold">{score(item.value)}</p></div>)}
                          </div>
                        ) : null}

                        {concentration !== null && concentration >= 0.35 ? (
                          <div className="mt-4 rounded-lg border border-amber-300/20 bg-amber-950/20 p-3 text-sm text-amber-100"><AlertTriangle className="mr-2 inline h-4 w-4" />{sv ? `${summary?.largestPosition ?? "Största positionen"} är ungefär ${(concentration * 100).toFixed(1)} % av portföljen. Det är en koncentrationsobservation att undersöka närmare, inte ett köp-/säljråd.` : `${summary?.largestPosition ?? "The largest position"} is about ${(concentration * 100).toFixed(1)}% of the portfolio. This is a concentration observation to investigate, not buy/sell advice.`}</div>
                        ) : null}

                        <div className="mt-6">
                          <div className="flex flex-wrap items-end justify-between gap-2"><div><h3 className="font-semibold text-[#f4efe5]">{sv ? "Positioner" : "Positions"}</h3><p className="mt-1 text-xs text-[#8f9bac]">{sv ? "Mobilanpassade kort med inköpsdata, marknadsläge och senaste StockBox-signaler." : "Mobile-friendly cards with purchase data, market state and latest StockBox signals."}</p></div>{latest ? <p className="text-xs text-[#7f8b9b]">{sv ? "Priser uppdaterade" : "Prices updated"}: {dateTime(latest.prices_updated_at, locale)}</p> : null}</div>
                          <div className="mt-3 grid gap-3 xl:grid-cols-2">
                            {positions.map((position) => {
                              const analysisRows = analysisHistory.get(position.ticker) ?? [];
                              const latestAnalysis = analysisRows[0];
                              const previousAnalysis = analysisRows[1];
                              const currentReport = latestAnalysis?.report;
                              const currentScore = numeric(latestAnalysis?.score) ?? currentReport?.score.score ?? null;
                              const priorScore = numeric(previousAnalysis?.score) ?? previousAnalysis?.report?.score.score ?? null;
                              const scoreDelta = currentScore !== null && priorScore !== null ? currentScore - priorScore : null;
                              const snapshotPosition = snapshotHoldings.find((item) => item.ticker === position.ticker && item.currency === position.currency) ?? snapshotHoldings.find((item) => item.ticker === position.ticker);
                              const currentPrice = snapshotPosition?.currentPrice ?? currentReport?.market?.price ?? null;
                              const marketCurrency = snapshotPosition?.marketCurrency ?? currentReport?.market?.currency ?? position.currency;
                              const nativeValue = currentPrice !== null && marketCurrency === position.currency ? currentPrice * position.quantity : null;
                              const nativePl = nativeValue !== null ? nativeValue - position.costBasis : null;
                              const plBase = snapshotPosition?.unrealizedProfitLossBase ?? null;
                              const displayPl = plBase ?? nativePl;
                              const displayPlCurrency = plBase !== null ? portfolio.base_currency : position.currency;
                              const weight = snapshotPosition?.weight ?? null;
                              const recommendation = latestAnalysis?.recommendation ?? currentReport?.recommendation ?? null;
                              const dims = [
                                [sv ? "Värdering" : "Valuation", dimension(currentReport, "valuation")],
                                [sv ? "Tillväxt" : "Growth", dimension(currentReport, "growth")],
                                [sv ? "Lönsamhet" : "Profitability", dimension(currentReport, "profitability")],
                                [sv ? "Finansiell hälsa" : "Financial health", dimension(currentReport, "financialHealth")],
                                [sv ? "Kvalitet" : "Quality", dimension(currentReport, "quality")],
                                [sv ? "Risk" : "Risk", dimension(currentReport, "risk")],
                                ["Momentum", dimension(currentReport, "momentum")],
                              ] as const;
                              return (
                                <div key={`${position.ticker}-${position.currency}`} className="rounded-xl border border-white/10 bg-[#0b1829] p-4">
                                  <div className="flex items-start justify-between gap-3"><div><p className="font-mono text-sm font-semibold text-[#e1cb95]">{position.ticker}</p><p className="mt-1 text-xs text-[#8f9bac]">{position.quantity.toLocaleString(locale === "sv" ? "sv-SE" : "en-GB", { maximumFractionDigits: 6 })} {sv ? "aktier" : "shares"} · {position.currency}</p></div>{recommendation ? <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${recommendationTone(recommendation)}`}>{recommendation} · {sv ? "analysindikator" : "research signal"}</span> : null}</div>
                                  <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                                    <div><p className="text-[11px] text-[#7f8b9b]">{sv ? "Snittpris" : "Avg. cost"}</p><p className="mt-1 text-sm font-semibold">{money(position.averagePurchasePrice, position.currency, locale)}</p></div>
                                    <div><p className="text-[11px] text-[#7f8b9b]">{sv ? "Nuvarande pris" : "Current price"}</p><p className="mt-1 text-sm font-semibold">{money(currentPrice, marketCurrency, locale)}</p></div>
                                    <div><p className="text-[11px] text-[#7f8b9b]">P/L</p><p className={`mt-1 text-sm font-semibold ${(displayPl ?? 0) >= 0 ? "text-emerald-200" : "text-red-200"}`}>{money(displayPl, displayPlCurrency, locale)}</p></div>
                                    <div><p className="text-[11px] text-[#7f8b9b]">{sv ? "Vikt" : "Weight"}</p><p className="mt-1 text-sm font-semibold">{weight === null ? "—" : `${(weight * 100).toFixed(1)}%`}</p></div>
                                  </div>
                                  <div className="mt-4 flex flex-wrap items-center gap-2"><div className="rounded-lg border border-[#e1cb95]/20 bg-[#e1cb95]/5 px-3 py-2"><span className="text-xs text-[#bba975]">Score</span><span className="ml-2 font-semibold">{currentScore === null ? "—" : Math.round(currentScore)}</span>{scoreDelta !== null ? <span className={`ml-2 text-xs ${scoreDelta >= 0 ? "text-emerald-200" : "text-red-200"}`}>{scoreDelta >= 0 ? "+" : ""}{scoreDelta.toFixed(1)}</span> : null}</div><span className="text-xs text-[#7f8b9b]">{sv ? "Analys" : "Analysis"}: {dateTime(latestAnalysis?.created_at, locale)}</span></div>
                                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">{dims.map(([label, value]) => <div key={label} className="rounded-md bg-white/[0.035] p-2"><p className="truncate text-[10px] text-[#7f8b9b]">{label}</p><p className="mt-1 text-xs font-semibold">{value === null ? "—" : Math.round(value)}</p></div>)}</div>
                                  <p className="mt-3 text-[11px] leading-5 text-[#6f7b8c]">{sv ? `Första registrerade köp: ${position.firstPurchaseDate ?? "—"}. Buy/Hold/Sell visas som StockBox analysindikator, aldrig som garanti.` : `First recorded purchase: ${position.firstPurchaseDate ?? "—"}. Buy/Hold/Sell is shown as a StockBox research indicator, never a guarantee.`}</p>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        <div className="mt-7 border-t border-white/10 pt-6">
                          <h3 className="font-semibold text-[#f4efe5]">{sv ? "Köp- och transaktionshistorik" : "Purchase and transaction history"}</h3>
                          <p className="mt-1 text-xs leading-5 text-[#8f9bac]">{sv ? "Varje köp är en egen rad. Ändringar räknar om positionens cost basis från hela transaktionskedjan." : "Every purchase is its own row. Changes rebuild position cost basis from the complete transaction chain."}</p>
                          {transactionsAvailable && portfolioTransactions.length ? (
                            <div className="mt-3 grid gap-2">
                              {portfolioTransactions.slice(0, 30).map((transaction) => (
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
                                  ) : (
                                    <div className="flex items-center justify-between gap-3 text-sm"><span><span className="mr-2 rounded bg-white/8 px-2 py-1 text-[10px] uppercase">{transaction.transaction_type}</span><strong>{transaction.ticker}</strong> · {money(transaction.cash_amount, transaction.currency, locale)} · {transaction.executed_at}</span><form action={removePortfolioTransactionAction}><input type="hidden" name="id" value={transaction.id} /><Button variant="ghost" className="min-h-10"><Trash2 className="h-4 w-4" /><span className="sr-only">{sv ? "Ta bort" : "Delete"}</span></Button></form></div>
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : <p className="mt-3 text-sm text-[#7f8b9b]">{transactionsAvailable ? (sv ? "Ingen transaktionshistorik ännu." : "No transaction history yet.") : (sv ? "Historiken aktiveras efter databasmigreringen." : "History activates after the database migration.")}</p>}
                        </div>

                        <div className="mt-7 border-t border-white/10 pt-6">
                          <div className="flex flex-wrap items-end justify-between gap-2"><div><h3 className="font-semibold text-[#f4efe5]">{sv ? "Portfolio history" : "Portfolio history"}</h3><p className="mt-1 text-xs text-[#8f9bac]">{sv ? "Varje helportföljanalys sparar en snapshot för senare trendgrafer och jämförelser." : "Every whole-portfolio analysis saves a snapshot for future trend charts and comparisons."}</p></div>{summary?.strongestHolding || summary?.weakestHolding ? <p className="text-xs text-[#8f9bac]">{sv ? "Starkast" : "Strongest"}: <strong className="text-[#c9d2df]">{summary.strongestHolding ?? "—"}</strong> · {sv ? "Svagast" : "Weakest"}: <strong className="text-[#c9d2df]">{summary.weakestHolding ?? "—"}</strong></p> : null}</div>
                          {history.length ? <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{history.map((snapshot) => <div key={snapshot.id} className="rounded-lg border border-white/10 bg-white/[0.025] p-3"><div className="flex items-center justify-between gap-2"><span className="inline-flex items-center gap-1.5 text-xs text-[#8f9bac]"><CalendarDays className="h-3.5 w-3.5" />{dateTime(snapshot.created_at, locale)}</span>{(numeric(snapshot.unrealized_pl) ?? 0) >= 0 ? <TrendingUp className="h-4 w-4 text-emerald-200" /> : <TrendingDown className="h-4 w-4 text-red-200" />}</div><div className="mt-3 grid grid-cols-3 gap-2"><div><p className="text-[10px] text-[#6f7b8c]">{sv ? "Värde" : "Value"}</p><p className="mt-1 text-xs font-semibold">{money(snapshot.portfolio_value, snapshot.base_currency, locale)}</p></div><div><p className="text-[10px] text-[#6f7b8c]">Score</p><p className="mt-1 text-xs font-semibold">{score(snapshot.portfolio_score)}</p></div><div><p className="text-[10px] text-[#6f7b8c]">{sv ? "Risk" : "Risk"}</p><p className="mt-1 text-xs font-semibold">{score(snapshot.risk_score)}</p></div></div>{snapshot.failures?.length ? <p className="mt-2 text-[10px] text-amber-200">{snapshot.failures.length} {sv ? "datavarningar" : "data warnings"}</p> : null}</div>)}</div> : <p className="mt-3 text-sm text-[#7f8b9b]">{snapshotsAvailable ? (sv ? "Kör din första portföljanalys för att skapa historik." : "Run your first portfolio analysis to create history.") : (sv ? "Historik aktiveras efter databasmigreringen." : "History activates after the database migration.")}</p>}
                        </div>
                      </>
                    ) : (
                      <div className="mt-6 rounded-xl border border-dashed border-white/15 bg-white/[0.02] p-6 text-center"><BriefcaseBusiness className="mx-auto h-8 w-8 text-[#e1cb95]" /><h3 className="mt-3 font-semibold">{sv ? "Portföljen är tom" : "This portfolio is empty"}</h3><p className="mx-auto mt-2 max-w-lg text-sm text-[#8f9bac]">{sv ? "Registrera ditt första köp ovan. Därefter kan StockBox räkna cost basis och koppla analysdata till positionen." : "Record your first purchase above. StockBox can then calculate cost basis and connect research data to the position."}</p></div>
                    )}
                  </Card>
                );
              }) : (
                <Card className="text-center"><BriefcaseBusiness className="mx-auto h-8 w-8 text-[#e1cb95]" /><h2 className="mt-3 font-semibold">{copy.noPortfolios}</h2><p className="mt-2 text-sm text-[#9aa7b8]">{copy.emptyCopy}</p></Card>
              )}
            </div>
          </>
        )}
      </Container>
    </Section>
  );
}
