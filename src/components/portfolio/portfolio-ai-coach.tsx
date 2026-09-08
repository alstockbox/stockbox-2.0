"use client";

import { ArrowRight, Bot, CheckCircle2, CircleDollarSign, Lightbulb, RefreshCw, ShieldAlert, Sparkles, Target } from "lucide-react";
import { useMemo, useState } from "react";
import { ButtonLink } from "@/components/ui/button";
import {
  buildPortfolioActionPlan,
  buildPortfolioUpgradeDrivers,
  buildRebalancePlan,
  createPortfolioPlan,
  findPortfolioUpgradeCandidates,
  type Horizon,
  type PortfolioAction,
  type PortfolioAiCandidate,
  type PortfolioBreadth,
  type PortfolioSnapshotDelta,
  type PortfolioStyle,
  type PortfolioUpgradeDriverDimension,
  type RiskPreference,
} from "@/lib/portfolio/portfolio-ai-planner";

type HoldingSignal = {
  ticker: string;
  weight: number | null;
  score: number | null;
  recommendation: string | null;
};

type PortfolioSummary = {
  id: string;
  name: string;
  baseCurrency: string;
  portfolioValue: number | null;
  portfolioScore: number | null;
  riskScore: number | null;
  diversificationScore: number | null;
  largestPosition: string | null;
  largestPositionWeight: number | null;
  snapshotDelta: PortfolioSnapshotDelta | null;
  holdings: HoldingSignal[];
};

type Props = {
  locale: "sv" | "en";
  portfolios: PortfolioSummary[];
  candidates: PortfolioAiCandidate[];
  asOf: string;
};

function formatMoney(value: number, currency: string, locale: "sv" | "en") {
  try {
    return new Intl.NumberFormat(locale === "sv" ? "sv-SE" : "en-GB", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${Math.round(value).toLocaleString(locale === "sv" ? "sv-SE" : "en-GB")} ${currency}`;
  }
}

function formatPercent(value: number | null | undefined, digits = 1) {
  return typeof value === "number" && Number.isFinite(value) ? `${(value * 100).toFixed(digits)}%` : "—";
}

function signed(value: number | null | undefined, digits = 1) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}`;
}

function signedPercentPoints(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  const points = value * 100;
  return `${points > 0 ? "+" : ""}${points.toFixed(1)} pp`;
}

function driverLabel(dimension: PortfolioUpgradeDriverDimension, sv: boolean) {
  if (dimension === "quality") return sv ? "Kvalitet" : "Quality";
  if (dimension === "risk") return "Risk";
  if (dimension === "growth") return sv ? "Tillväxt" : "Growth";
  if (dimension === "valuation") return sv ? "Värdering" : "Valuation";
  return "Momentum";
}

function actionText(action: PortfolioAction, sv: boolean) {
  switch (action.code) {
    case "negative_signal":
      return {
        title: sv ? `Prioritet: granska ${action.ticker ?? "innehavet"}` : `Priority: review ${action.ticker ?? "holding"}`,
        detail: sv
          ? `Senaste StockBox-signalen är ${action.recommendation ?? "negativ"}. Verifiera caset och den nya analysen innan du tillför mer kapital.`
          : `Latest StockBox signal is ${action.recommendation ?? "negative"}. Verify the thesis and latest analysis before adding more capital.`,
      };
    case "concentration":
      return {
        title: sv ? "Sänk koncentrationsrisken" : "Reduce concentration risk",
        detail: sv
          ? `${action.ticker ?? "Största positionen"} ligger på ${formatPercent(action.currentValue)} mot målprofilens cirka ${formatPercent(action.targetValue)} maxvikt.`
          : `${action.ticker ?? "Largest position"} is ${formatPercent(action.currentValue)} versus the profile target of roughly ${formatPercent(action.targetValue)} maximum.`,
      };
    case "risk_mismatch":
      return {
        title: sv ? "Matcha risken mot defensiv profil" : "Align risk with defensive profile",
        detail: sv
          ? `Risk-score är ${Math.round(action.currentValue ?? 0)}/100. Prioritera högre risk-score, kvalitet och mindre positionsstorlekar.`
          : `Risk score is ${Math.round(action.currentValue ?? 0)}/100. Prioritize higher risk scores, quality and smaller position sizes.`,
      };
    case "weak_holding":
      return {
        title: sv ? `Granska svagaste innehavet: ${action.ticker ?? "—"}` : `Review weakest holding: ${action.ticker ?? "—"}`,
        detail: sv
          ? `Aktuell StockBox-score är ${Math.round(action.currentValue ?? 0)}/100. Jämför investeringscaset med starkare analyserade alternativ.`
          : `Current StockBox score is ${Math.round(action.currentValue ?? 0)}/100. Compare the thesis with stronger analyzed alternatives.`,
      };
    case "diversification":
      return {
        title: sv ? "Förbättra diversifieringen" : "Improve diversification",
        detail: sv
          ? `Diversifieringsscore är ${Math.round(action.currentValue ?? 0)}/100. Fokusera på oberoende avkastningsdrivare, inte bara fler tickers.`
          : `Diversification score is ${Math.round(action.currentValue ?? 0)}/100. Focus on independent return drivers, not simply more tickers.`,
      };
    case "stale_data":
      return {
        title: sv ? "Uppdatera analysunderlaget" : "Refresh analysis coverage",
        detail: sv
          ? `Minst ${action.count ?? 0} ytterligare färska analyser behövs för den valda målprofilen. AI:n fyller inte dataluckor med gissningar.`
          : `At least ${action.count ?? 0} additional fresh analyses are needed for the selected profile. The AI does not fill data gaps with guesses.`,
      };
    case "portfolio_score":
      return {
        title: sv ? "Stärk Portfolio Score" : "Strengthen Portfolio Score",
        detail: sv
          ? `Helhetsbetyget är ${Math.round(action.currentValue ?? 0)}/100. Börja med svaga signaler, koncentration och daterade analyser.`
          : `Overall score is ${Math.round(action.currentValue ?? 0)}/100. Start with weak signals, concentration and stale analyses.`,
      };
    case "healthy":
      return {
        title: sv ? "Inga akuta strukturproblem" : "No urgent structural issues",
        detail: sv
          ? "Portföljen ligger rimligt mot den valda profilen utifrån aktuell StockBox-data. Fortsätt följa förändringar och håll analyserna färska."
          : "The portfolio is reasonably aligned with the selected profile based on current StockBox data. Keep monitoring changes and refresh analyses.",
      };
  }
}

function priorityLabel(action: PortfolioAction, sv: boolean) {
  if (action.priority === "high") return sv ? "Hög" : "High";
  if (action.priority === "medium") return sv ? "Medel" : "Medium";
  if (action.priority === "low") return sv ? "Låg" : "Low";
  return sv ? "Stabil" : "Stable";
}

function priorityClasses(action: PortfolioAction) {
  if (action.priority === "high") return "border-red-400/20 bg-red-950/15";
  if (action.priority === "positive") return "border-emerald-400/20 bg-emerald-950/15";
  return "border-amber-300/20 bg-amber-950/15";
}

export function PortfolioAiCoach({ locale, portfolios, candidates, asOf }: Props) {
  const sv = locale === "sv";
  const [mode, setMode] = useState<"improve" | "build">(portfolios.length ? "improve" : "build");
  const [portfolioId, setPortfolioId] = useState(portfolios[0]?.id ?? "");
  const [risk, setRisk] = useState<RiskPreference>("balanced");
  const [horizon, setHorizon] = useState<Horizon>("long");
  const [style, setStyle] = useState<PortfolioStyle>("balanced");
  const [breadth, setBreadth] = useState<PortfolioBreadth>("balanced");
  const [budget, setBudget] = useState(() => {
    const portfolioValue = portfolios[0]?.portfolioValue;
    if (typeof portfolioValue === "number" && Number.isFinite(portfolioValue) && portfolioValue > 0) return Math.round(portfolioValue);
    return sv ? 100_000 : 10_000;
  });
  const [cashReservePercent, setCashReservePercent] = useState(10);

  const selected = portfolios.find((portfolio) => portfolio.id === portfolioId) ?? portfolios[0] ?? null;
  const budgetCurrency = selected?.baseCurrency ?? (sv ? "SEK" : "USD");

  const plan = useMemo(() => createPortfolioPlan({
    candidates,
    budget,
    cashReservePercent,
    risk,
    horizon,
    style,
    breadth,
    now: asOf,
  }), [asOf, breadth, budget, candidates, cashReservePercent, horizon, risk, style]);

  const actionPlan = useMemo(() => selected ? buildPortfolioActionPlan({
    portfolioScore: selected.portfolioScore,
    riskScore: selected.riskScore,
    diversificationScore: selected.diversificationScore,
    largestPosition: selected.largestPosition,
    largestPositionWeight: selected.largestPositionWeight,
    requestedMaxPositionWeight: plan.requestedMaxPositionWeight,
    holdings: selected.holdings,
    dataQuality: plan.dataQuality,
    risk,
  }) : [], [plan.dataQuality, plan.requestedMaxPositionWeight, risk, selected]);

  const weakHolding = useMemo(() => {
    if (!selected) return null;
    const scored = selected.holdings
      .filter((holding) => typeof holding.score === "number" && Number.isFinite(holding.score))
      .sort((a, b) => (a.score ?? 100) - (b.score ?? 100));
    const negative = scored.find((holding) => ["Sell", "Strong Sell"].includes(holding.recommendation ?? ""));
    const weakest = negative ?? scored[0] ?? null;
    if (!weakest) return null;
    if (!["Sell", "Strong Sell"].includes(weakest.recommendation ?? "") && (weakest.score ?? 100) >= 60) return null;
    return weakest;
  }, [selected]);

  const weakAnalysis = useMemo(() => {
    if (!weakHolding) return null;
    const ticker = weakHolding.ticker.trim().toUpperCase();
    return candidates.find((candidate) => candidate.ticker.trim().toUpperCase() === ticker) ?? null;
  }, [candidates, weakHolding]);

  const upgradeCandidates = useMemo(() => weakHolding && selected ? findPortfolioUpgradeCandidates({
    weakHolding: { ticker: weakHolding.ticker, score: weakHolding.score },
    currentHoldingTickers: selected.holdings.map((holding) => holding.ticker),
    candidates,
    risk,
    style,
    horizon,
    now: asOf,
    minimumScoreImprovement: 8,
    limit: 3,
  }) : [], [asOf, candidates, horizon, risk, selected, style, weakHolding]);

  const upgradeDriversByTicker = useMemo(() => {
    const result = new Map<string, ReturnType<typeof buildPortfolioUpgradeDrivers>>();
    if (!weakAnalysis) return result;
    for (const candidate of upgradeCandidates) {
      const drivers = buildPortfolioUpgradeDrivers({
        weakCandidate: weakAnalysis,
        upgradeCandidate: candidate,
        risk,
        style,
        horizon,
        limit: 3,
      });
      if (drivers.length) result.set(candidate.ticker, drivers);
    }
    return result;
  }, [horizon, risk, style, upgradeCandidates, weakAnalysis]);

  const rebalancePlan = useMemo(() => {
    if (!selected) return [];
    const current = selected.holdings
      .filter((holding) => typeof holding.weight === "number" && Number.isFinite(holding.weight))
      .map((holding) => ({ ticker: holding.ticker, currentWeight: holding.weight as number }));
    if (!current.length) return [];
    return buildRebalancePlan(
      current,
      plan.allocation.map((item) => ({ ticker: item.ticker, targetPortfolioWeight: item.targetPortfolioWeight })),
    );
  }, [plan.allocation, selected]);

  const snapshotDelta = selected?.snapshotDelta ?? null;

  return (
    <div className="rounded-2xl border border-[#e1cb95]/20 bg-gradient-to-br from-[#0d1b2c] to-[#08111d] p-4 sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#e1cb95]"><Bot className="h-4 w-4" />StockBox AI</p>
          <h2 className="mt-2 text-xl font-semibold text-[#f4efe5]">{sv ? "Portföljcoach & portföljbyggare" : "Portfolio coach & builder"}</h2>
          <p className="mt-2 text-sm leading-6 text-[#9aa7b8]">{sv ? "Bygg en målportfölj eller få en prioriterad förbättringsplan. Allt härleds från dina färska StockBox-analyser och portföljdata; inga order skapas." : "Build a target portfolio or get a prioritized improvement plan. Everything is derived from your fresh StockBox analyses and portfolio data; no orders are created."}</p>
        </div>
        <div className="flex rounded-lg border border-white/10 bg-black/15 p-1">
          <button type="button" onClick={() => setMode("improve")} disabled={!portfolios.length} className={`rounded-md px-3 py-2 text-xs font-semibold ${mode === "improve" ? "bg-[#b99b5f] text-[#07111f]" : "text-[#b8c2cf] hover:bg-white/5"}`}>{sv ? "Förbättra" : "Improve"}</button>
          <button type="button" onClick={() => setMode("build")} className={`rounded-md px-3 py-2 text-xs font-semibold ${mode === "build" ? "bg-[#b99b5f] text-[#07111f]" : "text-[#b8c2cf] hover:bg-white/5"}`}>{sv ? "Bygg portfölj" : "Build portfolio"}</button>
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {mode === "improve" && portfolios.length ? (
          <label className="text-xs text-[#8f9bac]">{sv ? "Portfölj" : "Portfolio"}<select value={portfolioId} onChange={(event) => setPortfolioId(event.target.value)} className="mt-1 h-11 w-full rounded-md border border-white/12 bg-[#07111f] px-3 text-sm text-[#f4efe5]">{portfolios.map((portfolio) => <option key={portfolio.id} value={portfolio.id}>{portfolio.name}</option>)}</select></label>
        ) : null}
        <label className="text-xs text-[#8f9bac]">{sv ? "Risknivå" : "Risk level"}<select value={risk} onChange={(event) => setRisk(event.target.value as RiskPreference)} className="mt-1 h-11 w-full rounded-md border border-white/12 bg-[#07111f] px-3 text-sm text-[#f4efe5]"><option value="defensive">{sv ? "Defensiv" : "Defensive"}</option><option value="balanced">{sv ? "Balanserad" : "Balanced"}</option><option value="aggressive">{sv ? "Offensiv" : "Aggressive"}</option></select></label>
        <label className="text-xs text-[#8f9bac]">{sv ? "Tidshorisont" : "Horizon"}<select value={horizon} onChange={(event) => setHorizon(event.target.value as Horizon)} className="mt-1 h-11 w-full rounded-md border border-white/12 bg-[#07111f] px-3 text-sm text-[#f4efe5]"><option value="short">{sv ? "0–3 år" : "0–3 years"}</option><option value="medium">{sv ? "3–7 år" : "3–7 years"}</option><option value="long">{sv ? "7+ år" : "7+ years"}</option></select></label>
        <label className="text-xs text-[#8f9bac]">{sv ? "Stil" : "Style"}<select value={style} onChange={(event) => setStyle(event.target.value as PortfolioStyle)} className="mt-1 h-11 w-full rounded-md border border-white/12 bg-[#07111f] px-3 text-sm text-[#f4efe5]"><option value="balanced">{sv ? "Balanserad" : "Balanced"}</option><option value="growth">Growth</option><option value="quality">Quality</option><option value="value">Value</option></select></label>
        <label className="text-xs text-[#8f9bac]">{sv ? "Spridning" : "Breadth"}<select value={breadth} onChange={(event) => setBreadth(event.target.value as PortfolioBreadth)} className="mt-1 h-11 w-full rounded-md border border-white/12 bg-[#07111f] px-3 text-sm text-[#f4efe5]"><option value="focused">{sv ? "Fokuserad" : "Focused"}</option><option value="balanced">{sv ? "Balanserad" : "Balanced"}</option><option value="broad">{sv ? "Bred" : "Broad"}</option></select></label>
        <label className="text-xs text-[#8f9bac]">{sv ? "Investeringsbelopp" : "Investment amount"}<div className="relative mt-1"><input type="number" min="0" step="100" value={budget} onChange={(event) => setBudget(Math.max(0, Number(event.target.value) || 0))} className="h-11 w-full rounded-md border border-white/12 bg-[#07111f] px-3 pr-14 text-sm text-[#f4efe5]" /><span className="pointer-events-none absolute right-3 top-3 text-xs text-[#8f9bac]">{budgetCurrency}</span></div></label>
        <label className="text-xs text-[#8f9bac]">{sv ? "Kassareserv" : "Cash reserve"}<div className="relative mt-1"><input type="number" min="0" max="80" step="1" value={cashReservePercent} onChange={(event) => setCashReservePercent(Math.min(80, Math.max(0, Number(event.target.value) || 0)))} className="h-11 w-full rounded-md border border-white/12 bg-[#07111f] px-3 pr-9 text-sm text-[#f4efe5]" /><span className="pointer-events-none absolute right-3 top-3 text-xs text-[#8f9bac]">%</span></div></label>
        {selected?.portfolioValue && selected.portfolioValue > 0 ? (
          <div className="flex items-end"><button type="button" onClick={() => setBudget(Math.round(selected.portfolioValue ?? 0))} className="h-11 w-full rounded-md border border-white/10 bg-white/5 px-3 text-xs font-semibold text-[#c9d2df] hover:bg-white/10"><RefreshCw className="mr-2 inline h-3.5 w-3.5" />{sv ? "Använd portföljvärde" : "Use portfolio value"}</button></div>
        ) : null}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-black/10 p-3"><p className="text-[10px] uppercase tracking-wide text-[#6f7b8c]">{sv ? "Investeras" : "Invested"}</p><p className="mt-1 text-base font-semibold text-[#f4efe5]">{formatMoney(plan.investableAmount, budgetCurrency, locale)}</p></div>
        <div className="rounded-xl border border-white/10 bg-black/10 p-3"><p className="text-[10px] uppercase tracking-wide text-[#6f7b8c]">{sv ? "Kassareserv" : "Cash reserve"}</p><p className="mt-1 text-base font-semibold text-[#f4efe5]">{formatMoney(plan.cashReserveAmount, budgetCurrency, locale)}</p></div>
        <div className="rounded-xl border border-white/10 bg-black/10 p-3"><p className="text-[10px] uppercase tracking-wide text-[#6f7b8c]">{sv ? "Mål max/position" : "Target max/position"}</p><p className="mt-1 text-base font-semibold text-[#f4efe5]">{formatPercent(plan.requestedMaxPositionWeight, 0)}</p></div>
      </div>

      {plan.dataQuality.status !== "good" ? (
        <div className="mt-4 rounded-lg border border-amber-300/20 bg-amber-950/20 p-3 text-xs leading-5 text-amber-100">
          <p className="font-semibold">{sv ? "AI-underlaget behöver stärkas" : "AI data coverage needs improvement"}</p>
          <p className="mt-1">{sv ? `${plan.dataQuality.freshCount} färska kvalificerade analyser finns. ${plan.dataQuality.recommendedAdditionalAnalyses} ytterligare färska analyser rekommenderas för målprofilen.` : `${plan.dataQuality.freshCount} fresh qualifying analyses are available. ${plan.dataQuality.recommendedAdditionalAnalyses} additional fresh analyses are recommended for this profile.`}</p>
          {plan.dataQuality.staleTickers.length ? <p className="mt-1 text-amber-200/80">{sv ? "Daterade/okända analysdatum:" : "Stale/unknown analysis dates:"} {plan.dataQuality.staleTickers.slice(0, 8).join(", ")}{plan.dataQuality.staleTickers.length > 8 ? "…" : ""}</p> : null}
          <ButtonLink href="/analyze" variant="ghost" className="mt-2 w-fit">{sv ? "Uppdatera analyser" : "Refresh analyses"}<ArrowRight className="h-4 w-4" /></ButtonLink>
        </div>
      ) : (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-emerald-400/15 bg-emerald-950/10 p-3 text-xs text-emerald-100"><CheckCircle2 className="h-4 w-4" />{sv ? "Underlaget har tillräckligt många färska StockBox-analyser för vald målprofil." : "The data set has enough fresh StockBox analyses for the selected target profile."}</div>
      )}

      {mode === "improve" && selected ? (
        <div className="mt-6 space-y-5">
          <div>
            <div className="flex items-center justify-between gap-3"><div><p className="text-sm font-semibold text-[#f4efe5]">{sv ? "Prioriterad AI Action Plan" : "Prioritized AI Action Plan"}</p><p className="mt-1 text-xs text-[#8f9bac]">{sv ? "Åtgärder sorteras efter vad som mest behöver din uppmärksamhet först." : "Actions are sorted by what needs your attention first."}</p></div><span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] text-[#9aa7b8]">{sv ? "Prioritet" : "Priority"}</span></div>
            <div className="mt-3 grid gap-3 lg:grid-cols-3">
              {actionPlan.slice(0, 6).map((action, index) => {
                const copy = actionText(action, sv);
                return (
                  <div key={`${action.code}-${action.ticker ?? index}`} className={`rounded-xl border p-4 ${priorityClasses(action)}`}>
                    <div className="flex items-start gap-2">
                      {action.priority === "high" ? <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-200" /> : action.priority === "positive" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-200" /> : <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-200" />}
                      <div><p className="text-[10px] font-semibold uppercase tracking-wide text-[#8f9bac]">{priorityLabel(action, sv)}</p><h3 className="mt-1 text-sm font-semibold text-[#eef2f7]">{copy.title}</h3><p className="mt-2 text-xs leading-5 text-[#aab4c2]">{copy.detail}</p></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {weakHolding && upgradeCandidates.length ? (
            <div className="rounded-xl border border-[#e1cb95]/15 bg-[#e1cb95]/[0.035] p-4">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[#f4efe5]">{sv ? "Analyserade alternativ att jämföra" : "Analyzed alternatives to compare"}</p>
                  <p className="mt-1 text-xs leading-5 text-[#8f9bac]">{sv ? `${weakHolding.ticker} är det svagaste relevanta innehavet i denna genomgång. Nedan visas bara färska analyser som förbättrar StockBox-score med minst 8 punkter och inte redan finns i portföljen.` : `${weakHolding.ticker} is the weakest relevant holding in this review. Only fresh analyses that improve StockBox score by at least 8 points and are not already held are shown below.`}</p>
                </div>
                <span className="rounded-full border border-white/10 bg-black/10 px-3 py-1 text-[10px] text-[#9aa7b8]">{sv ? "Jämförelse, inte order" : "Comparison, not an order"}</span>
              </div>
              <div className="mt-3 grid gap-3 lg:grid-cols-3">
                {upgradeCandidates.map((candidate) => {
                  const drivers = upgradeDriversByTicker.get(candidate.ticker) ?? [];
                  return (
                    <div key={candidate.ticker} className="rounded-lg border border-white/10 bg-black/10 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div><p className="font-mono text-sm font-semibold text-[#e1cb95]">{candidate.ticker}</p><p className="mt-1 line-clamp-1 text-xs text-[#9aa7b8]">{candidate.name}</p></div>
                        <span className="rounded-full border border-emerald-400/20 bg-emerald-950/20 px-2 py-1 text-[10px] font-semibold text-emerald-200">+{candidate.scoreImprovement.toFixed(0)} score</span>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-[10px] text-[#8f9bac]">
                        <div className="rounded bg-white/[0.035] p-2"><span>Score</span><p className="mt-1 text-xs font-semibold text-[#eef2f7]">{Math.round(candidate.score ?? 0)}</p></div>
                        <div className="rounded bg-white/[0.035] p-2"><span>{sv ? "profilmatch" : "profile fit"}</span><p className="mt-1 text-xs font-semibold text-[#eef2f7]">{Math.round(candidate.profileRank)}</p></div>
                        <div className="rounded bg-white/[0.035] p-2"><span>{sv ? "Kvalitet" : "Quality"}</span><p className="mt-1 text-xs font-semibold text-[#eef2f7]">{Math.round(candidate.quality ?? 0)}</p></div>
                        <div className="rounded bg-white/[0.035] p-2"><span>Risk</span><p className="mt-1 text-xs font-semibold text-[#eef2f7]">{Math.round(candidate.risk ?? 0)}</p></div>
                      </div>
                      {drivers.length ? (
                        <div className="mt-3 border-t border-white/10 pt-3">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-[#8f9bac]">{sv ? "Varför bättre?" : "Why better?"}</p>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {drivers.map((driver) => (
                              <span key={driver.dimension} className="rounded-full border border-emerald-400/15 bg-emerald-950/15 px-2 py-1 text-[10px] text-emerald-100">
                                {driverLabel(driver.dimension, sv)} +{driver.improvement.toFixed(0)}
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      <p className="mt-2 text-[10px] leading-4 text-[#6f7b8c]">{candidate.recommendation ?? "No Rating"} · {sv ? "färsk StockBox-analys" : "fresh StockBox analysis"}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="rounded-xl border border-white/10 bg-black/10 p-4">
            <p className="text-sm font-semibold text-[#f4efe5]">{sv ? "Vad har förändrats?" : "What changed?"}</p>
            {snapshotDelta ? (
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                <div className="rounded-lg bg-white/[0.035] p-3"><p className="text-[10px] text-[#6f7b8c]">Portfolio Score</p><p className="mt-1 text-sm font-semibold text-[#eef2f7]">{signed(snapshotDelta.portfolioScore)}</p></div>
                <div className="rounded-lg bg-white/[0.035] p-3"><p className="text-[10px] text-[#6f7b8c]">{sv ? "Risk-score" : "Risk score"}</p><p className="mt-1 text-sm font-semibold text-[#eef2f7]">{signed(snapshotDelta.riskScore)}</p></div>
                <div className="rounded-lg bg-white/[0.035] p-3"><p className="text-[10px] text-[#6f7b8c]">{sv ? "Diversifiering" : "Diversification"}</p><p className="mt-1 text-sm font-semibold text-[#eef2f7]">{signed(snapshotDelta.diversificationScore)}</p></div>
                <div className="rounded-lg bg-white/[0.035] p-3"><p className="text-[10px] text-[#6f7b8c]">{sv ? "Orealiserad P/L" : "Unrealized P/L"}</p><p className="mt-1 text-sm font-semibold text-[#eef2f7]">{snapshotDelta.unrealizedProfitLoss === null ? "—" : `${snapshotDelta.unrealizedProfitLoss > 0 ? "+" : ""}${formatMoney(snapshotDelta.unrealizedProfitLoss, selected.baseCurrency, locale)}`}</p></div>
                <div className="rounded-lg bg-white/[0.035] p-3"><p className="text-[10px] text-[#6f7b8c]">{sv ? "Portföljvärde" : "Portfolio value"}</p><p className="mt-1 text-sm font-semibold text-[#eef2f7]">{snapshotDelta.portfolioValue === null ? "—" : `${snapshotDelta.portfolioValue > 0 ? "+" : ""}${formatMoney(snapshotDelta.portfolioValue, selected.baseCurrency, locale)}`}</p></div>
                <div className="rounded-lg bg-white/[0.035] p-3"><p className="text-[10px] text-[#6f7b8c]">{sv ? "Största position" : "Largest position"}</p><p className="mt-1 text-sm font-semibold text-[#eef2f7]">{signedPercentPoints(snapshotDelta.largestPositionWeight)}</p></div>
              </div>
            ) : <p className="mt-2 text-xs leading-5 text-[#8f9bac]">{sv ? "Minst två portföljsnapshots behövs innan StockBox kan visa förändringen över tid." : "At least two portfolio snapshots are needed before StockBox can show changes over time."}</p>}
          </div>

          <div>
            <div className="flex items-center gap-2"><RefreshCw className="h-4 w-4 text-[#e1cb95]" /><p className="text-sm font-semibold text-[#f4efe5]">{sv ? "Rebalanseringsvy" : "Rebalancing view"}</p></div>
            <p className="mt-1 text-xs leading-5 text-[#8f9bac]">{sv ? "Jämför aktuell vikt mot AI-utkastets målvikt. Detta är beslutsstöd och skapar inga köp- eller säljorder." : "Compare current weights with the AI draft target weights. This is decision support and creates no buy or sell orders."}</p>
            {rebalancePlan.length ? (
              <div className="mt-3 overflow-x-auto rounded-xl border border-white/10">
                <table className="w-full min-w-[640px] text-left text-xs"><thead className="bg-white/[0.035] text-[#8f9bac]"><tr><th className="px-3 py-2">Ticker</th><th className="px-3 py-2">{sv ? "Nuvarande" : "Current"}</th><th className="px-3 py-2">{sv ? "Målvikt" : "Target weight"}</th><th className="px-3 py-2">Delta</th><th className="px-3 py-2">{sv ? "Värdedelta" : "Value delta"}</th></tr></thead><tbody>{rebalancePlan.slice(0, 12).map((item) => { const valueDelta = typeof selected.portfolioValue === "number" && Number.isFinite(selected.portfolioValue) ? item.deltaWeight * selected.portfolioValue : null; return <tr key={item.ticker} className="border-t border-white/10"><td className="px-3 py-2 font-mono font-semibold text-[#e1cb95]">{item.ticker}</td><td className="px-3 py-2 text-[#c9d2df]">{formatPercent(item.currentWeight)}</td><td className="px-3 py-2 text-[#c9d2df]">{formatPercent(item.targetPortfolioWeight)}</td><td className="px-3 py-2 font-semibold text-[#eef2f7]">{signedPercentPoints(item.deltaWeight)}</td><td className="px-3 py-2 text-[#c9d2df]">{valueDelta === null ? "—" : `${valueDelta > 0 ? "+" : ""}${formatMoney(valueDelta, selected.baseCurrency, locale)}`}</td></tr>; })}</tbody></table>
              </div>
            ) : <p className="mt-3 rounded-lg border border-dashed border-white/10 p-3 text-xs text-[#8f9bac]">{sv ? "Kör en portföljanalys så att aktuella positionsvikter finns tillgängliga för jämförelsen." : "Run a portfolio analysis so current position weights are available for comparison."}</p>}
          </div>
        </div>
      ) : null}

      {mode === "build" ? (
        <div className="mt-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div><p className="flex items-center gap-2 text-sm font-semibold text-[#f4efe5]"><Target className="h-4 w-4 text-[#e1cb95]" />{sv ? "AI-portföljutkast" : "AI portfolio draft"}</p><p className="mt-1 text-xs leading-5 text-[#8f9bac]">{sv ? `Mål: cirka ${plan.desiredHoldingCount} innehav, ${(plan.requestedMaxPositionWeight * 100).toFixed(0)} % maxvikt och ${cashReservePercent}% kassareserv. Endast färska kvalificerade StockBox-analyser kan väljas.` : `Target: roughly ${plan.desiredHoldingCount} holdings, ${(plan.requestedMaxPositionWeight * 100).toFixed(0)}% max weight and ${cashReservePercent}% cash reserve. Only fresh qualifying StockBox analyses can be selected.`}</p></div>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-[#c9d2df]">{plan.allocation.length} {sv ? "valda kandidater" : "selected candidates"}</span>
          </div>

          {plan.capRelaxed ? <div className="mt-4 rounded-lg border border-amber-300/20 bg-amber-950/20 p-3 text-xs leading-5 text-amber-100">{sv ? `För få färska kandidater finns för målprofilens viktgräns. Utkastet måste därför tillfälligt tillåta upp till ${(plan.effectiveMaxPositionWeight * 100).toFixed(1)} % per position. Analysera fler bolag innan du betraktar fördelningen som färdig.` : `There are too few fresh candidates for the profile's weight cap. The draft must temporarily allow up to ${(plan.effectiveMaxPositionWeight * 100).toFixed(1)}% per position. Analyze more companies before treating the allocation as complete.`}</div> : null}

          {plan.allocation.length ? (
            <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {plan.allocation.map((candidate, index) => (
                <div key={candidate.ticker} className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
                  <div className="flex items-start justify-between gap-3"><div><span className="text-[10px] font-semibold text-[#6f7b8c]">#{index + 1}</span><p className="mt-0.5 font-mono text-sm font-semibold text-[#e1cb95]">{candidate.ticker}</p><p className="mt-1 line-clamp-1 text-xs text-[#9aa7b8]">{candidate.name}</p></div><div className="text-right"><p className="text-lg font-semibold text-[#f4efe5]">{formatPercent(candidate.targetPortfolioWeight)}</p><p className="mt-0.5 text-xs font-semibold text-[#c9d2df]">{formatMoney(candidate.targetAmount, budgetCurrency, locale)}</p><p className="mt-0.5 text-[10px] text-[#6f7b8c]">{sv ? "målvikt / belopp" : "target / amount"}</p></div></div>
                  <div className="mt-3 flex flex-wrap gap-2 text-[10px] text-[#9aa7b8]"><span className="rounded bg-white/5 px-2 py-1">Score {Math.round(candidate.score ?? 0)}</span>{candidate.recommendation ? <span className="rounded bg-white/5 px-2 py-1">{candidate.recommendation}</span> : null}<span className="rounded bg-white/5 px-2 py-1">Q {Math.round(candidate.quality ?? 0)}</span><span className="rounded bg-white/5 px-2 py-1">R {Math.round(candidate.risk ?? 0)}</span></div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-xl border border-dashed border-white/15 p-5 text-sm text-[#9aa7b8]">{sv ? "Det finns inte tillräckligt med färska StockBox-analyser för ett datagrundat portföljutkast. AI:n väljer hellre inga bolag än att gissa." : "There are not enough fresh StockBox analyses for a grounded portfolio draft. The AI prefers selecting no companies over guessing."}<ButtonLink href="/analyze" variant="secondary" className="mt-3 w-fit"><Sparkles className="h-4 w-4" />{sv ? "Analysera kandidater" : "Analyze candidates"}</ButtonLink></div>
          )}
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-white/10 bg-black/10 p-3 text-[11px] leading-5 text-[#7f8b9c]"><CircleDollarSign className="mt-0.5 h-4 w-4 shrink-0" /><p>{sv ? "Beloppen är målfördelningar av din angivna budget, inte orderstorlekar. StockBox genomför inga transaktioner och tar inte hänsyn till courtage, skatt, fractional-share-stöd eller livepris i denna plan." : "Amounts are target allocations of your entered budget, not order sizes. StockBox executes no transactions and this plan does not account for fees, taxes, fractional-share support or live execution price."}</p></div>
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-2 border-t border-white/10 pt-4">
        <ButtonLink href="/analyze" variant="secondary"><Sparkles className="h-4 w-4" />{sv ? "Analysera ett nytt bolag" : "Analyze a new company"}</ButtonLink>
        {selected ? <ButtonLink href={`/portfolio?portfolio=${encodeURIComponent(selected.id)}`} variant="ghost">{sv ? "Öppna hela portföljen" : "Open full portfolio"}<ArrowRight className="h-4 w-4" /></ButtonLink> : null}
      </div>
    </div>
  );
}
