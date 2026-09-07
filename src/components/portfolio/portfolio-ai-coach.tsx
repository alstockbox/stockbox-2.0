"use client";

import { ArrowRight, Bot, CheckCircle2, Lightbulb, ShieldAlert, Sparkles, Target } from "lucide-react";
import { useMemo, useState } from "react";
import { ButtonLink } from "@/components/ui/button";

type Candidate = {
  ticker: string;
  name: string;
  score: number | null;
  recommendation: string | null;
  valuation: number | null;
  growth: number | null;
  quality: number | null;
  risk: number | null;
  momentum: number | null;
};

type HoldingSignal = {
  ticker: string;
  weight: number | null;
  score: number | null;
  recommendation: string | null;
};

type PortfolioSummary = {
  id: string;
  name: string;
  portfolioScore: number | null;
  riskScore: number | null;
  diversificationScore: number | null;
  largestPosition: string | null;
  largestPositionWeight: number | null;
  holdings: HoldingSignal[];
};

type Props = {
  locale: "sv" | "en";
  portfolios: PortfolioSummary[];
  candidates: Candidate[];
};

type RiskPreference = "defensive" | "balanced" | "aggressive";
type Horizon = "short" | "medium" | "long";
type Style = "balanced" | "growth" | "quality" | "value";
type Breadth = "focused" | "balanced" | "broad";

const recommendationPenalty: Record<string, number> = {
  "Strong Buy": 10,
  Buy: 6,
  Hold: 0,
  Sell: -28,
  "Strong Sell": -45,
  "No Rating": -8,
};

function n(value: number | null | undefined, fallback = 50) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function candidateRank(candidate: Candidate, risk: RiskPreference, style: Style, horizon: Horizon) {
  const overall = n(candidate.score);
  const valuation = n(candidate.valuation);
  const growth = n(candidate.growth);
  const quality = n(candidate.quality);
  const riskScore = n(candidate.risk);
  const momentum = n(candidate.momentum);
  let rank = overall * 0.42 + quality * 0.14 + riskScore * 0.1 + valuation * 0.1 + growth * 0.14 + momentum * 0.1;

  if (style === "growth") rank += growth * 0.18 + momentum * 0.08 - valuation * 0.04;
  if (style === "quality") rank += quality * 0.2 + riskScore * 0.08;
  if (style === "value") rank += valuation * 0.22 + quality * 0.06;
  if (risk === "defensive") rank += riskScore * 0.16 + quality * 0.08 - momentum * 0.03;
  if (risk === "aggressive") rank += growth * 0.1 + momentum * 0.12;
  if (horizon === "long") rank += quality * 0.07 + growth * 0.05;
  if (horizon === "short") rank += momentum * 0.1;
  rank += recommendationPenalty[candidate.recommendation ?? "No Rating"] ?? 0;
  return rank;
}

function targetCount(breadth: Breadth) {
  return breadth === "focused" ? 6 : breadth === "broad" ? 14 : 10;
}

function targetMaxWeight(risk: RiskPreference, breadth: Breadth) {
  const breadthCap = breadth === "focused" ? 0.22 : breadth === "broad" ? 0.1 : 0.15;
  if (risk === "defensive") return Math.min(breadthCap, 0.12);
  if (risk === "aggressive") return Math.min(0.25, breadthCap + 0.04);
  return breadthCap;
}

function buildWeights(count: number, maxWeight: number) {
  if (count <= 0) return [];
  const raw = Array.from({ length: count }, (_, index) => Math.max(1, count - index * 0.28));
  const total = raw.reduce((sum, value) => sum + value, 0);
  let weights = raw.map((value) => value / total);
  for (let pass = 0; pass < 8; pass += 1) {
    const excess = weights.reduce((sum, weight) => sum + Math.max(0, weight - maxWeight), 0);
    weights = weights.map((weight) => Math.min(weight, maxWeight));
    if (excess < 0.0001) break;
    const eligible = weights.map((weight, index) => ({ weight, index })).filter((item) => item.weight < maxWeight - 0.0001);
    if (!eligible.length) break;
    const room = eligible.reduce((sum, item) => sum + (maxWeight - item.weight), 0);
    for (const item of eligible) weights[item.index] += excess * ((maxWeight - item.weight) / room);
  }
  const normalized = weights.reduce((sum, value) => sum + value, 0);
  return weights.map((weight) => weight / normalized);
}

export function PortfolioAiCoach({ locale, portfolios, candidates }: Props) {
  const sv = locale === "sv";
  const [mode, setMode] = useState<"improve" | "build">(portfolios.length ? "improve" : "build");
  const [portfolioId, setPortfolioId] = useState(portfolios[0]?.id ?? "");
  const [risk, setRisk] = useState<RiskPreference>("balanced");
  const [horizon, setHorizon] = useState<Horizon>("long");
  const [style, setStyle] = useState<Style>("balanced");
  const [breadth, setBreadth] = useState<Breadth>("balanced");

  const selected = portfolios.find((portfolio) => portfolio.id === portfolioId) ?? portfolios[0] ?? null;
  const maxWeight = targetMaxWeight(risk, breadth);

  const rankedCandidates = useMemo(() => candidates
    .filter((candidate) => candidate.score !== null && !["Sell", "Strong Sell"].includes(candidate.recommendation ?? ""))
    .map((candidate) => ({ ...candidate, rank: candidateRank(candidate, risk, style, horizon) }))
    .sort((a, b) => b.rank - a.rank), [candidates, horizon, risk, style]);

  const modelPortfolio = useMemo(() => {
    const count = Math.min(targetCount(breadth), rankedCandidates.length);
    const chosen = rankedCandidates.slice(0, count);
    const weights = buildWeights(chosen.length, maxWeight);
    return chosen.map((candidate, index) => ({ ...candidate, targetWeight: weights[index] ?? 0 }));
  }, [breadth, maxWeight, rankedCandidates]);

  const improvementIdeas = useMemo(() => {
    if (!selected) return [] as Array<{ level: "high" | "medium" | "positive"; title: string; detail: string }>;
    const ideas: Array<{ level: "high" | "medium" | "positive"; title: string; detail: string }> = [];
    const concentration = selected.largestPositionWeight;
    if (concentration !== null && concentration > maxWeight) ideas.push({
      level: "high",
      title: sv ? "Koncentrationen är högre än din målprofil" : "Concentration is above your target profile",
      detail: sv ? `${selected.largestPosition ?? "Största positionen"} väger cirka ${(concentration * 100).toFixed(1)} %. Med dina val är riktmärket högst cirka ${(maxWeight * 100).toFixed(0)} % per position.` : `${selected.largestPosition ?? "Largest position"} is about ${(concentration * 100).toFixed(1)}%. Your selected profile targets roughly ${(maxWeight * 100).toFixed(0)}% or less per position.`,
    });
    if (n(selected.diversificationScore, 100) < 60) ideas.push({
      level: "medium",
      title: sv ? "Diversifieringen kan förbättras" : "Diversification can improve",
      detail: sv ? `Diversifieringsscore är ${Math.round(n(selected.diversificationScore))}/100. StockBox skulle prioritera fler oberoende drivkrafter framför fler positioner som beter sig likadant.` : `Diversification score is ${Math.round(n(selected.diversificationScore))}/100. StockBox would prioritize independent return drivers rather than simply adding more correlated positions.`,
    });
    if (risk === "defensive" && n(selected.riskScore, 100) < 65) ideas.push({
      level: "high",
      title: sv ? "Riskprofilen matchar inte defensivt mål" : "Risk profile does not match a defensive target",
      detail: sv ? `Risk-score är ${Math.round(n(selected.riskScore))}/100. Prioritera högre kvalitet/risk-score och mindre positionsstorlekar innan du jagar mer uppsida.` : `Risk score is ${Math.round(n(selected.riskScore))}/100. Prioritize higher quality/risk scores and smaller position sizes before pursuing more upside.`,
    });
    const weak = [...selected.holdings].filter((holding) => holding.score !== null).sort((a, b) => n(a.score) - n(b.score))[0];
    if (weak && n(weak.score) < 55) ideas.push({
      level: "medium",
      title: sv ? `Granska ${weak.ticker}` : `Review ${weak.ticker}`,
      detail: sv ? `${weak.ticker} har lägst aktuell StockBox-score i portföljen (${Math.round(n(weak.score))}/100). Kontrollera om investeringscaset fortfarande passar din valda stil innan du ökar positionen.` : `${weak.ticker} has the lowest current StockBox score in the portfolio (${Math.round(n(weak.score))}/100). Re-check whether the thesis still fits your chosen style before adding exposure.`,
    });
    const negativeSignal = selected.holdings.find((holding) => ["Sell", "Strong Sell"].includes(holding.recommendation ?? ""));
    if (negativeSignal) ideas.push({
      level: "high",
      title: sv ? `Ny analys krävs för ${negativeSignal.ticker}` : `Fresh review needed for ${negativeSignal.ticker}`,
      detail: sv ? `Senaste StockBox-signalen är ${negativeSignal.recommendation}. Det är en analysindikator, inte en automatisk order; öppna caset och verifiera vad som driver signalen.` : `Latest StockBox signal is ${negativeSignal.recommendation}. This is a research indicator, not an automatic order; open the case and verify what drives the signal.`,
    });
    if (!ideas.length) ideas.push({
      level: "positive",
      title: sv ? "Inga uppenbara strukturproblem hittades" : "No obvious structural issues found",
      detail: sv ? "Utifrån dina val och den data som finns ser portföljen rimligt balanserad ut. Nästa steg är att hålla analyserna färska och följa förändringar i score, risk och koncentration." : "Based on your preferences and available data, the portfolio looks reasonably balanced. Keep analyses fresh and monitor changes in score, risk and concentration.",
    });
    return ideas;
  }, [maxWeight, risk, selected, sv]);

  const availableCandidateCount = rankedCandidates.length;

  return (
    <div className="rounded-2xl border border-[#e1cb95]/20 bg-gradient-to-br from-[#0d1b2c] to-[#08111d] p-4 sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#e1cb95]"><Bot className="h-4 w-4" />StockBox AI</p>
          <h2 className="mt-2 text-xl font-semibold text-[#f4efe5]">{sv ? "Portföljcoach & portföljbyggare" : "Portfolio coach & builder"}</h2>
          <p className="mt-2 text-sm leading-6 text-[#9aa7b8]">{sv ? "Ställ in hur du vill investera. StockBox väger ihop verifierade analyser, riskscore, kvalitet, värdering, tillväxt, momentum och portföljkoncentration till konkreta förbättringar eller ett portföljutkast." : "Set how you want to invest. StockBox combines verified analyses, risk, quality, valuation, growth, momentum and portfolio concentration into concrete improvements or a portfolio draft."}</p>
        </div>
        <div className="flex rounded-lg border border-white/10 bg-black/15 p-1">
          <button type="button" onClick={() => setMode("improve")} disabled={!portfolios.length} className={`rounded-md px-3 py-2 text-xs font-semibold ${mode === "improve" ? "bg-[#b99b5f] text-[#07111f]" : "text-[#b8c2cf] hover:bg-white/5"}`}>{sv ? "Förbättra" : "Improve"}</button>
          <button type="button" onClick={() => setMode("build")} className={`rounded-md px-3 py-2 text-xs font-semibold ${mode === "build" ? "bg-[#b99b5f] text-[#07111f]" : "text-[#b8c2cf] hover:bg-white/5"}`}>{sv ? "Bygg portfölj" : "Build portfolio"}</button>
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {mode === "improve" && portfolios.length ? <label className="text-xs text-[#8f9bac]">{sv ? "Portfölj" : "Portfolio"}<select value={portfolioId} onChange={(event) => setPortfolioId(event.target.value)} className="mt-1 h-11 w-full rounded-md border border-white/12 bg-[#07111f] px-3 text-sm text-[#f4efe5]">{portfolios.map((portfolio) => <option key={portfolio.id} value={portfolio.id}>{portfolio.name}</option>)}</select></label> : null}
        <label className="text-xs text-[#8f9bac]">{sv ? "Risknivå" : "Risk level"}<select value={risk} onChange={(event) => setRisk(event.target.value as RiskPreference)} className="mt-1 h-11 w-full rounded-md border border-white/12 bg-[#07111f] px-3 text-sm text-[#f4efe5]"><option value="defensive">{sv ? "Defensiv" : "Defensive"}</option><option value="balanced">{sv ? "Balanserad" : "Balanced"}</option><option value="aggressive">{sv ? "Offensiv" : "Aggressive"}</option></select></label>
        <label className="text-xs text-[#8f9bac]">{sv ? "Tidshorisont" : "Horizon"}<select value={horizon} onChange={(event) => setHorizon(event.target.value as Horizon)} className="mt-1 h-11 w-full rounded-md border border-white/12 bg-[#07111f] px-3 text-sm text-[#f4efe5]"><option value="short">{sv ? "0–3 år" : "0–3 years"}</option><option value="medium">{sv ? "3–7 år" : "3–7 years"}</option><option value="long">{sv ? "7+ år" : "7+ years"}</option></select></label>
        <label className="text-xs text-[#8f9bac]">{sv ? "Stil" : "Style"}<select value={style} onChange={(event) => setStyle(event.target.value as Style)} className="mt-1 h-11 w-full rounded-md border border-white/12 bg-[#07111f] px-3 text-sm text-[#f4efe5]"><option value="balanced">{sv ? "Balanserad" : "Balanced"}</option><option value="growth">Growth</option><option value="quality">Quality</option><option value="value">Value</option></select></label>
        <label className="text-xs text-[#8f9bac]">{sv ? "Spridning" : "Breadth"}<select value={breadth} onChange={(event) => setBreadth(event.target.value as Breadth)} className="mt-1 h-11 w-full rounded-md border border-white/12 bg-[#07111f] px-3 text-sm text-[#f4efe5]"><option value="focused">{sv ? "Fokuserad" : "Focused"}</option><option value="balanced">{sv ? "Balanserad" : "Balanced"}</option><option value="broad">{sv ? "Bred" : "Broad"}</option></select></label>
      </div>

      {mode === "improve" && selected ? (
        <div className="mt-6 grid gap-3 lg:grid-cols-3">
          {improvementIdeas.slice(0, 6).map((idea, index) => (
            <div key={`${idea.title}-${index}`} className={`rounded-xl border p-4 ${idea.level === "high" ? "border-red-400/20 bg-red-950/15" : idea.level === "positive" ? "border-emerald-400/20 bg-emerald-950/15" : "border-amber-300/20 bg-amber-950/15"}`}>
              <div className="flex items-start gap-2">{idea.level === "high" ? <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-200" /> : idea.level === "positive" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-200" /> : <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-200" />}<div><h3 className="text-sm font-semibold text-[#eef2f7]">{idea.title}</h3><p className="mt-2 text-xs leading-5 text-[#aab4c2]">{idea.detail}</p></div></div>
            </div>
          ))}
        </div>
      ) : null}

      {mode === "build" ? (
        <div className="mt-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div><p className="flex items-center gap-2 text-sm font-semibold text-[#f4efe5]"><Target className="h-4 w-4 text-[#e1cb95]" />{sv ? "AI-utkast" : "AI draft"}</p><p className="mt-1 text-xs leading-5 text-[#8f9bac]">{sv ? `Mål: ${targetCount(breadth)} innehav, cirka ${(maxWeight * 100).toFixed(0)} % maxvikt. Kandidater rankas endast bland dina senaste StockBox-analyser.` : `Target: ${targetCount(breadth)} holdings, roughly ${(maxWeight * 100).toFixed(0)}% max weight. Candidates are ranked only from your recent StockBox analyses.`}</p></div>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-[#c9d2df]">{availableCandidateCount} {sv ? "godkända kandidater" : "eligible candidates"}</span>
          </div>
          {modelPortfolio.length ? (
            <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {modelPortfolio.map((candidate, index) => (
                <div key={candidate.ticker} className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
                  <div className="flex items-start justify-between gap-3"><div><span className="text-[10px] font-semibold text-[#6f7b8c]">#{index + 1}</span><p className="mt-0.5 font-mono text-sm font-semibold text-[#e1cb95]">{candidate.ticker}</p><p className="mt-1 line-clamp-1 text-xs text-[#9aa7b8]">{candidate.name}</p></div><div className="text-right"><p className="text-lg font-semibold text-[#f4efe5]">{(candidate.targetWeight * 100).toFixed(1)}%</p><p className="text-[10px] text-[#6f7b8c]">{sv ? "målvikt" : "target"}</p></div></div>
                  <div className="mt-3 flex flex-wrap gap-2 text-[10px] text-[#9aa7b8]"><span className="rounded bg-white/5 px-2 py-1">Score {Math.round(n(candidate.score))}</span>{candidate.recommendation ? <span className="rounded bg-white/5 px-2 py-1">{candidate.recommendation}</span> : null}<span className="rounded bg-white/5 px-2 py-1">Q {Math.round(n(candidate.quality))}</span><span className="rounded bg-white/5 px-2 py-1">R {Math.round(n(candidate.risk))}</span></div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-xl border border-dashed border-white/15 p-5 text-sm text-[#9aa7b8]">{sv ? "Det finns inte tillräckligt med färska StockBox-analyser för att bygga ett datagrundat utkast ännu. Analysera några bolag först så kan AI-byggaren rangordna dem." : "There are not enough recent StockBox analyses to build a grounded draft yet. Analyze a few companies first and the builder can rank them."}<ButtonLink href="/analyze" variant="secondary" className="mt-3 w-fit"><Sparkles className="h-4 w-4" />{sv ? "Analysera kandidater" : "Analyze candidates"}</ButtonLink></div>
          )}
          <p className="mt-4 text-[11px] leading-5 text-[#6f7b8c]">{sv ? "AI-utkastet är ett analys- och beslutsstöd. Det skapar inga köporder och använder inga bolag som saknar StockBox-data. Bekräfta alltid pris, valuta, riskspridning och investeringscase innan du agerar." : "The AI draft is research and decision support. It creates no orders and never introduces companies without StockBox data. Verify price, currency, diversification and the investment thesis before acting."}</p>
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-2 border-t border-white/10 pt-4"><ButtonLink href="/analyze" variant="secondary"><Sparkles className="h-4 w-4" />{sv ? "Analysera ett nytt bolag" : "Analyze a new company"}</ButtonLink>{selected ? <ButtonLink href={`/portfolio?portfolio=${encodeURIComponent(selected.id)}`} variant="ghost">{sv ? "Öppna hela portföljen" : "Open full portfolio"}<ArrowRight className="h-4 w-4" /></ButtonLink> : null}</div>
    </div>
  );
}
