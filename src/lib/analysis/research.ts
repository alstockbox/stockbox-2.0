import { clamp, isFiniteNumber, safeDivide } from "./math";
import { MIN_DIRECTIONAL_VALUATION_CONFIDENCE } from "./config";
import { deriveSimpleFreeCashFlow } from "./metrics";
import type {
  AnalysisReport, AnalysisSource, DeepReport, DeepReportSection, DeepSectionId, FinancialAnalysisInput,
  FinancialAnalysisResult, FinancialMetrics, FinancialPeriod, InflectionScoreResult, InsiderContextResult,
  InsiderTransaction, MarketSnapshot, MaterialNewsEvent, MaterialNewsEventType, MetricProvenance,
  MultiScoreResult, ResearchEvidence, ResearchEvent, ResearchFinding, ResearchLayerId, ResearchLayerStatus,
  ResearchModuleId, ResearchModuleResult, ResearchPlan, ResearchResult, ResearchScore, ResearchScoreContributor,
  ResearchSignal, SourceTier,
} from "./types";

export type DeepResearchResources = {
  market?: MarketSnapshot | null;
  filings?: {
    status: "available" | "partial" | "unavailable" | "unsupported";
    events: ResearchEvent[];
    evidence: ResearchEvidence[];
    dataAsOf: string | null;
    coverage: number;
    confidence: number;
    reason?: string;
  };
};

const DEEP_SECTIONS: Array<[DeepSectionId, string]> = [
  ["executive_thesis", "Executive Investment Thesis"], ["company_overview", "Company Overview"],
  ["business_model", "Business Model"], ["revenue_profit_drivers", "Revenue / Profit Drivers"],
  ["segment_analysis", "Segment Analysis"], ["geographic_exposure", "Geographic Exposure"],
  ["historical_financial_trend", "Historical Financial Trend"], ["growth_quality", "Growth Quality"],
  ["margin_development", "Margin Development"], ["capital_efficiency", "Capital Efficiency"],
  ["balance_sheet", "Balance Sheet"], ["cash_flow", "Cash Flow"], ["capital_allocation", "Capital Allocation"],
  ["share_dilution_sbc", "Share Dilution / SBC"], ["archetype_kpis", "Archetype-specific KPIs"],
  ["valuation", "Valuation"], ["peer_comparison", "Peer Comparison"], ["historical_valuation", "Historical Valuation"],
  ["risk_analysis", "Risk Analysis"], ["catalysts", "Catalysts"], ["scenarios", "Bull / Base / Bear"],
  ["improve_case", "What Would Improve the Case"], ["break_thesis", "What Would Break the Thesis"],
  ["watch_next", "What to Watch Next"], ["data_confidence", "Data Confidence"],
  ["sources_provenance", "Sources / Provenance"], ["missing_data", "Missing Data"],
];

const RESEARCH_MODULES: Array<[ResearchModuleId, string]> = [
  ["fundamental_core", "Fundamental Core"], ["business_model_moat", "Business Model / Moat"],
  ["segments_geography", "Segments / Geography"], ["management_capital_allocation", "Management / Capital Allocation"],
  ["earnings_guidance", "Earnings / Guidance"], ["analyst_expectations", "Analyst Expectations / Estimate Revisions"],
  ["news_material_events", "News / Material Events"], ["insider_transactions", "Insider Transactions"],
  ["ownership_positioning", "Ownership / Short Interest / Positioning"], ["competitor_industry", "Competitor / Industry Analysis"],
  ["supply_chain_customers", "Supply Chain / Customer Concentration"], ["macro_exposure", "Macro Exposure"],
  ["geopolitical_exposure", "Geopolitical Exposure"], ["inflection_turnaround", "Inflection / Turnaround Analysis"],
  ["advanced_valuation_scenarios", "Advanced Valuation / Scenario Analysis"],
];

const QUALITY_WEIGHTS = {
  profitability: 0.2, cashFlow: 0.2, earningsQuality: 0.2, quality: 0.2, financialHealth: 0.15, growth: 0.05,
} as const;

function sourceTier(source: AnalysisSource): SourceTier {
  const name = source.name.toLowerCase();
  if (name.includes("sec") || name.includes("filing")) return "regulatory_filing";
  if (name.includes("investor relations") || name.includes("earnings release")) return "company_ir";
  if (name.includes("exchange")) return "exchange";
  return "financial_provider";
}

export function evidenceFromSources(sources: AnalysisSource[]): ResearchEvidence[] {
  return sources.map((source, index) => ({
    id: `source-${index + 1}`, kind: "reported_fact", sourceTier: sourceTier(source), title: source.name,
    source, dataAsOf: source.dataAsOf ?? null,
  }));
}

function signal(input: Omit<ResearchSignal, "id">): ResearchSignal {
  return { ...input, id: `${input.category}:${input.metric}:${input.periodCurrent ?? "current"}` };
}

function scoreSignal(category: ResearchSignal["category"], contributor: ResearchScoreContributor): ResearchSignal | null {
  if (!isFiniteNumber(contributor.score) || contributor.status !== "available") return null;
  const direction = contributor.score >= 65 ? "positive" : contributor.score <= 35 ? "negative" : null;
  if (!direction) return null;
  return signal({
    category, metric: contributor.key, current: contributor.value, previous: null, change: null,
    periodCurrent: null, periodPrevious: null, direction, confidence: Math.round(70 * contributor.coverage), evidenceIds: [],
    statement: `${contributor.label} is a ${direction} contributor (${Math.round(contributor.score)}/100).`,
  });
}

function evidenceForSignal(signal: ResearchSignal, evidence: ResearchEvidence[]): string[] {
  if (signal.source) {
    const provenanceKeys = [signal.source.provider, signal.source.source]
      .filter((value): value is string => Boolean(value))
      .map((value) => value.toLowerCase());
    const exact = evidence.filter((item) => {
      const sourceKeys = [item.source.provider, item.source.name]
        .filter((value): value is string => Boolean(value))
        .map((value) => value.toLowerCase());
      return provenanceKeys.some((provenanceKey) => sourceKeys.some(
        (sourceKey) => sourceKey === provenanceKey || sourceKey.includes(provenanceKey) || provenanceKey.includes(sourceKey),
      ));
    });
    if (exact.length) return exact.map((item) => item.id);
  }

  const capabilities = signal.category === "quality"
    ? ["fundamentals", "specialized"]
    : signal.category === "inflection"
      ? signal.metric === "priceMomentumConfirmation" ? ["market_data"] : ["fundamentals"]
      : ["range", "momentum"].includes(signal.metric)
        ? ["market_data"]
        : ["fundamentals", "specialized", "market_data", "estimates"];
  return evidence
    .filter((item) => item.source.capability && capabilities.includes(item.source.capability))
    .map((item) => item.id);
}

function scoreWithEvidence(score: ResearchScore, evidence: ResearchEvidence[]): ResearchScore {
  const attach = (item: ResearchSignal): ResearchSignal => item.evidenceIds.length
    ? item
    : { ...item, evidenceIds: evidenceForSignal(item, evidence) };
  return {
    ...score,
    positiveSignals: score.positiveSignals.map(attach),
    negativeSignals: score.negativeSignals.map(attach),
  };
}

function compositeScore(contributors: ResearchScoreContributor[], baseConfidence: number, minimumCoverage = 0.55, minimumAvailable = 3, category: ResearchSignal["category"] = "quality"): ResearchScore {
  const plannedWeight = contributors.reduce((sum, item) => sum + item.weight, 0);
  const coverage = plannedWeight > 0 ? contributors.reduce((sum, item) => sum + item.weight * item.coverage, 0) / plannedWeight : 0;
  const available = contributors.filter((item) => item.status === "available" && isFiniteNumber(item.score));
  const availableWeight = available.reduce((sum, item) => sum + item.weight, 0);
  const raw = availableWeight > 0 ? available.reduce((sum, item) => sum + (item.score as number) * item.weight, 0) / availableWeight : null;
  const adjusted = raw === null || coverage < minimumCoverage || available.length < minimumAvailable
    ? null : clamp(50 + (raw - 50) * coverage, 0, 100);
  const signals = contributors.map((item) => scoreSignal(category, item)).filter((item): item is ResearchSignal => Boolean(item));
  return {
    score: adjusted === null ? null : Math.round(adjusted), confidence: Math.round(baseConfidence * coverage), coverage,
    contributors, positiveSignals: signals.filter((item) => item.direction === "positive"),
    negativeSignals: signals.filter((item) => item.direction === "negative"),
  };
}

export function computeQualityScore(result: FinancialAnalysisResult): ResearchScore {
  const contributors: ResearchScoreContributor[] = Object.entries(QUALITY_WEIGHTS).map(([key, weight]) => {
    const dimension = result.scores.dimensions[key as keyof typeof QUALITY_WEIGHTS];
    const unsuitable = Boolean(dimension.contributors?.length) && dimension.contributors?.every((item) => item.availability === "unsuitable");
    return {
      key, label: dimension.label, value: dimension.score, score: dimension.score, weight,
      coverage: dimension.coverage ?? 0, status: unsuitable ? "unsuitable" : isFiniteNumber(dimension.score) ? "available" : "missing",
      reason: dimension.rationale,
    };
  });
  return compositeScore(contributors, result.scores.confidence);
}

function contributor(key: string, label: string, score: number | null, weight: number, coverage: number, status: ResearchScoreContributor["status"] = "available", reason?: string, value = score): ResearchScoreContributor {
  return { key, label, value, score: status === "available" ? score : null, weight, coverage, status: status === "available" && !isFiniteNumber(score) ? "missing" : status, reason };
}

function dcfOpportunity(result: FinancialAnalysisResult, market: MarketSnapshot | null | undefined): ResearchScoreContributor {
  if (result.dcf.status === "inappropriate") return contributor("dcf", "DCF upside", null, 0.15, 0, "unsuitable", result.dcf.reason);
  if (result.dcf.status !== "available" || !isFiniteNumber(result.dcf.mid) || !isFiniteNumber(market?.price) || market.price <= 0) {
    return contributor("dcf", "DCF upside", null, 0.15, 0, "missing", result.dcf.reason ?? "Usable DCF and market price are required.");
  }
  if (result.dcf.confidence !== undefined && result.dcf.confidence < MIN_DIRECTIONAL_VALUATION_CONFIDENCE) {
    return contributor("dcf", "DCF upside", null, 0.15, 0, "missing", "DCF confidence is too low for opportunity scoring.");
  }
  const upside = result.dcf.mid / market.price - 1;
  return contributor("dcf", "DCF upside", clamp(50 + upside * 100, 0, 100), 0.15, 1, "available", undefined, upside);
}

export function computeOpportunityScore(result: FinancialAnalysisResult, quality: ResearchScore, inflection: ResearchScore, market?: MarketSnapshot | null): ResearchScore {
  const valuation = result.scores.dimensions.valuation;
  const risk = result.scores.dimensions.risk;
  const momentum = result.scores.dimensions.momentum;
  const rangePosition = isFiniteNumber(market?.price) && isFiniteNumber(market?.yearLow) && isFiniteNumber(market?.yearHigh) && market.yearHigh > market.yearLow
    ? (market.price - market.yearLow) / (market.yearHigh - market.yearLow) : null;
  const contributors = [
    contributor("valuation", "Valuation", valuation.score, 0.3, valuation.coverage ?? 0, isFiniteNumber(valuation.score) ? "available" : "missing", valuation.rationale),
    dcfOpportunity(result, market),
    contributor("quality", "Business quality", quality.score, 0.2, quality.coverage, isFiniteNumber(quality.score) ? "available" : "missing", "Quality remains separate but constrains cheap low-quality opportunities."),
    contributor("risk", "Risk resilience", risk.score, 0.1, risk.coverage ?? 0, isFiniteNumber(risk.score) ? "available" : "missing", risk.rationale),
    contributor("range", "52-week price position", isFiniteNumber(rangePosition) ? clamp(70 - rangePosition * 40, 0, 100) : null, 0.1, isFiniteNumber(rangePosition) ? 1 : 0, isFiniteNumber(rangePosition) ? "available" : "missing", "Lower range position is only a bounded context signal.", rangePosition),
    contributor("momentum", "Market confirmation", momentum.score, 0.05, momentum.coverage ?? 0, isFiniteNumber(momentum.score) ? "available" : "missing", momentum.rationale),
    contributor("inflection", "Fundamental direction", inflection.score, 0.1, inflection.coverage, isFiniteNumber(inflection.score) ? "available" : "missing", "Deterioration prevents cheapness from carrying the score."),
  ];
  const valuationAvailable = contributors.some((item) => ["valuation", "dcf"].includes(item.key) && item.status === "available");
  const score = compositeScore(contributors, result.scores.confidence, 0.5, 4, "opportunity");
  return valuationAvailable ? score : { ...score, score: null };
}

function periodLabel(period: FinancialPeriod | null | undefined): string | null {
  return period?.periodEndDate ?? (period?.fiscalYear ? String(period.fiscalYear) : null);
}

export function areInflectionPeriodsComparable(current: FinancialPeriod | null, previous: FinancialPeriod | null): boolean {
  if (!current || !previous) return false;
  if (current.form === "TTM" || previous.form === "TTM") {
    return current.form === "TTM" && previous.form === "TTM" && current.periodBasis === previous.periodBasis
      && isFiniteNumber(current.currentYtdDurationDays) && isFiniteNumber(previous.currentYtdDurationDays)
      && Math.abs(current.currentYtdDurationDays - previous.currentYtdDurationDays) <= 15;
  }
  if (isFiniteNumber(current.fiscalYear) && isFiniteNumber(previous.fiscalYear)) return current.fiscalYear - previous.fiscalYear === 1;
  const currentDate = current.periodEndDate ? Date.parse(current.periodEndDate) : Number.NaN;
  const previousDate = previous.periodEndDate ? Date.parse(previous.periodEndDate) : Number.NaN;
  const days = (currentDate - previousDate) / 86_400_000;
  return Number.isFinite(days) && days >= 330 && days <= 400;
}

function metricProvenance(metrics: FinancialMetrics, metric: string): MetricProvenance | undefined {
  return metrics.provenance[metric] ?? metrics.latestPeriod?.provenance?.[metric];
}

function trendSignal(input: { metric: string; statement: string; current: number | null; previous: number | null; inverse?: boolean; currentPeriod: FinancialPeriod; previousPeriod: FinancialPeriod; metrics: FinancialMetrics; confidence?: number }): ResearchSignal | null {
  if (!isFiniteNumber(input.current) || !isFiniteNumber(input.previous)) return null;
  const change = input.current - input.previous;
  if (Math.abs(change) < 1e-9) return null;
  const positive = input.inverse ? change < 0 : change > 0;
  return signal({ category: "inflection", metric: input.metric, current: input.current, previous: input.previous, change,
    periodCurrent: periodLabel(input.currentPeriod), periodPrevious: periodLabel(input.previousPeriod), direction: positive ? "positive" : "negative",
    confidence: input.confidence ?? 85, source: metricProvenance(input.metrics, input.metric), evidenceIds: [],
    statement: `${input.statement} ${positive ? "improved" : "deteriorated"} versus the comparable prior period.` });
}

function periodRatio(period: FinancialPeriod, numerator: keyof FinancialPeriod, denominator: keyof FinancialPeriod): number | null {
  const left = period[numerator];
  const right = period[denominator];
  return typeof left === "number" && typeof right === "number" ? safeDivide(left, right) : null;
}

function buildInflectionSignals(result: FinancialAnalysisResult, input?: FinancialAnalysisInput, market?: MarketSnapshot | null): ResearchSignal[] {
  const current = result.metrics.latestPeriod;
  const previous = result.metrics.previousPeriod;
  if (!current || !previous || !areInflectionPeriodsComparable(current, previous)) return [];
  const signals: Array<ResearchSignal | null> = [
    trendSignal({ metric: "operatingMargin", statement: "Operating margin", current: periodRatio(current, "operatingIncome", "revenue"), previous: periodRatio(previous, "operatingIncome", "revenue"), currentPeriod: current, previousPeriod: previous, metrics: result.metrics }),
    trendSignal({ metric: "netMargin", statement: "Net margin", current: periodRatio(current, "netIncome", "revenue"), previous: periodRatio(previous, "netIncome", "revenue"), currentPeriod: current, previousPeriod: previous, metrics: result.metrics }),
    trendSignal({ metric: "cashConversion", statement: "Cash conversion", current: safeDivide(deriveSimpleFreeCashFlow(current), current.netIncome), previous: safeDivide(deriveSimpleFreeCashFlow(previous), previous.netIncome), currentPeriod: current, previousPeriod: previous, metrics: result.metrics }),
    trendSignal({ metric: "interestCoverage", statement: "Interest coverage", current: isFiniteNumber(current.operatingIncome) && isFiniteNumber(current.interestExpense) ? current.operatingIncome / Math.abs(current.interestExpense) : null, previous: isFiniteNumber(previous.operatingIncome) && isFiniteNumber(previous.interestExpense) ? previous.operatingIncome / Math.abs(previous.interestExpense) : null, currentPeriod: current, previousPeriod: previous, metrics: result.metrics }),
    trendSignal({ metric: "netIncome", statement: "Net income", current: current.netIncome ?? null, previous: previous.netIncome ?? null, currentPeriod: current, previousPeriod: previous, metrics: result.metrics }),
  ];
  const currentFcf = deriveSimpleFreeCashFlow(current);
  const previousFcf = deriveSimpleFreeCashFlow(previous);
  if (isFiniteNumber(currentFcf) && isFiniteNumber(previousFcf) && previousFcf < 0 && currentFcf > 0) {
    signals.push(signal({ category: "inflection", metric: "freeCashFlow", current: currentFcf, previous: previousFcf, change: currentFcf - previousFcf, periodCurrent: periodLabel(current), periodPrevious: periodLabel(previous), direction: "positive", confidence: 95, source: metricProvenance(result.metrics, "simpleFreeCashFlow"), evidenceIds: [], statement: "Free cash flow changed from negative to positive." }));
  } else signals.push(trendSignal({ metric: "freeCashFlow", statement: "Free cash flow", current: currentFcf, previous: previousFcf, currentPeriod: current, previousPeriod: previous, metrics: result.metrics }));
  const annual = [...(input?.annualPeriods ?? [])].sort((left, right) => (left.fiscalYear ?? 0) - (right.fiscalYear ?? 0));
  const [third, second, first] = annual.slice(-3);
  if (first && second && third && areInflectionPeriodsComparable(first, second) && areInflectionPeriodsComparable(second, third)) {
    const currentGrowth = isFiniteNumber(first.revenue) && isFiniteNumber(second.revenue) && second.revenue > 0 ? first.revenue / second.revenue - 1 : null;
    const previousGrowth = isFiniteNumber(second.revenue) && isFiniteNumber(third.revenue) && third.revenue > 0 ? second.revenue / third.revenue - 1 : null;
    signals.push(trendSignal({ metric: "revenueGrowthAcceleration", statement: "Revenue growth", current: currentGrowth, previous: previousGrowth, currentPeriod: first, previousPeriod: second, metrics: result.metrics, confidence: 90 }));
    const firstFcf = deriveSimpleFreeCashFlow(first); const secondFcf = deriveSimpleFreeCashFlow(second); const thirdFcf = deriveSimpleFreeCashFlow(third);
    const currentFcfGrowth = isFiniteNumber(firstFcf) && isFiniteNumber(secondFcf) && secondFcf !== 0 ? firstFcf / Math.abs(secondFcf) - 1 : null;
    const previousFcfGrowth = isFiniteNumber(secondFcf) && isFiniteNumber(thirdFcf) && thirdFcf !== 0 ? secondFcf / Math.abs(thirdFcf) - 1 : null;
    signals.push(trendSignal({ metric: "freeCashFlowGrowthAcceleration", statement: "Free-cash-flow growth", current: currentFcfGrowth, previous: previousFcfGrowth, currentPeriod: first, previousPeriod: second, metrics: result.metrics, confidence: 85 }));
  }
  const momentum = market?.performance["3M"] ?? market?.performance["1Y"] ?? null;
  if (isFiniteNumber(momentum) && signals.filter(Boolean).length >= 2) signals.push(signal({ category: "inflection", metric: "priceMomentumConfirmation", current: momentum, previous: null, change: null, periodCurrent: market?.date ?? null, periodPrevious: null, direction: momentum > 0 ? "positive" : "negative", confidence: 55, evidenceIds: [], statement: `Price momentum ${momentum > 0 ? "confirms" : "does not confirm"} the observed financial direction.` }));
  return signals.filter((item): item is ResearchSignal => Boolean(item));
}

function inflectionResearchScore(result: FinancialAnalysisResult, input?: FinancialAnalysisInput, market?: MarketSnapshot | null): ResearchScore {
  const signals = buildInflectionSignals(result, input, market);
  const financialSignals = signals.filter((item) => item.metric !== "priceMomentumConfirmation");
  const coverage = Math.min(1, financialSignals.length / 8);
  const contributors = signals.map((item) => contributor(item.id, item.statement, item.direction === "positive" ? 75 : 25, 1 / Math.max(signals.length, 1), item.confidence / 100, "available", undefined, item.change));
  const confidenceWeight = signals.reduce((sum, item) => sum + item.confidence, 0);
  const raw = financialSignals.length >= 3 && confidenceWeight > 0 ? signals.reduce((sum, item) => sum + (item.direction === "positive" ? 75 : 25) * item.confidence, 0) / confidenceWeight : null;
  return { score: raw === null ? null : Math.round(clamp(50 + (raw - 50) * coverage, 0, 100)), confidence: Math.round(result.scores.confidence * coverage), coverage, contributors, positiveSignals: signals.filter((item) => item.direction === "positive"), negativeSignals: signals.filter((item) => item.direction === "negative") };
}

export function computeInflectionResearchScore(result: FinancialAnalysisResult, input?: FinancialAnalysisInput, market?: MarketSnapshot | null): ResearchScore {
  return inflectionResearchScore(result, input, market);
}

export function computeInflectionScore(metrics: FinancialMetrics): InflectionScoreResult {
  const research = inflectionResearchScore({ metrics, scores: { confidence: 70 } } as FinancialAnalysisResult);
  const positives = research.positiveSignals.map((item) => item.statement); const negatives = research.negativeSignals.map((item) => item.statement);
  const direction = research.score === null ? "unknown" : research.score > 58 ? "positive" : research.score < 42 ? "negative" : "mixed";
  const stage = direction === "negative" ? "deteriorating" : direction === "positive" && positives.length >= 4 ? "accelerating" : direction === "positive" ? "early_turnaround" : direction === "mixed" ? "bottoming" : "unknown";
  return { inflectionScore: research.score, direction, confidence: research.confidence, supportingSignals: positives, contradictingSignals: negatives, estimatedStage: stage };
}

function layer(layerId: ResearchLayerId, label: string, status: ResearchLayerStatus["status"], coverage: number, confidence: number, dataAsOf: string | null, evidenceIds: string[], reason?: string): ResearchLayerStatus {
  return { layer: layerId, label, status, coverage, confidence, dataAsOf, evidenceIds, reason };
}

function researchLayers(result: FinancialAnalysisResult, resources: DeepResearchResources, evidence: ResearchEvidence[]): ResearchLayerStatus[] {
  const sourceIds = (...capabilities: NonNullable<AnalysisSource["capability"]>[]) => evidence
    .filter((item) => item.source.capability && capabilities.includes(item.source.capability))
    .map((item) => item.id);
  const fundamentalSourceIds = sourceIds("fundamentals", "specialized");
  const valuationSourceIds = sourceIds("fundamentals", "specialized", "market_data", "estimates");
  const marketSourceIds = sourceIds("market_data");
  const valuation = result.scores.dimensions.valuation;
  const marketAvailable = isFiniteNumber(resources.market?.price); const filings = resources.filings;
  return [
    layer("fundamental", "Fundamentals", result.dataStatus === "current" ? "available" : result.dataStatus === "stale" ? "unavailable" : "partial", result.dataCoverage, result.scores.confidence, result.diagnostics.latestFinancialPeriodEnd, fundamentalSourceIds, result.dataStatus === "stale" ? "Stale-data gate is active." : undefined),
    layer("valuation", "Valuation", isFiniteNumber(valuation.score) ? "available" : (valuation.coverage ?? 0) > 0 ? "partial" : "unavailable", valuation.coverage ?? 0, result.confidenceBreakdown.valuationInputs, result.diagnostics.marketPriceDate ?? null, valuationSourceIds, valuation.rationale),
    layer("market", "Market", marketAvailable ? "available" : "unavailable", marketAvailable ? 1 : 0, marketAvailable ? 85 : 0, resources.market?.date ?? null, marketSourceIds, marketAvailable ? undefined : "No configured market provider returned a price."),
    layer("filings_events", "Filings / events", filings?.status ?? "unavailable", filings?.coverage ?? 0, filings?.confidence ?? 0, filings?.dataAsOf ?? null, filings?.evidence.map((item) => item.id) ?? [], filings?.reason ?? "Deep SEC submissions research was unavailable."),
    layer("earnings_expectations", "Earnings expectations", "unavailable", 0, 0, null, [], "No earnings-estimates provider is configured."),
    layer("news_events", "News", "unavailable", 0, 0, null, [], "No news provider is configured for deterministic research."),
    layer("insider_ownership", "Insider / ownership", "unavailable", 0, 0, null, [], "No insider provider is configured."),
    layer("industry", "Industry", "unavailable", 0, 0, null, [], "No industry research provider is configured."),
    layer("macro", "Macro", "unavailable", 0, 0, null, [], "No macro research provider is configured."),
    layer("geopolitical", "Geopolitical", "unavailable", 0, 0, null, [], "No geopolitical research provider is configured."),
    layer("positioning", "Positioning", "unavailable", 0, 0, null, [], "No market-positioning provider is configured."),
  ];
}

const LAYER_WEIGHTS: Record<ResearchLayerId, number> = { fundamental: 0.2, valuation: 0.1, market: 0.1, filings_events: 0.1, earnings_expectations: 0.1, news_events: 0.1, insider_ownership: 0.08, industry: 0.08, macro: 0.05, geopolitical: 0.05, positioning: 0.04 };

function moduleResults(report: AnalysisReport, result: FinancialAnalysisResult, context: Omit<ResearchResult, "modules">): ResearchModuleResult[] {
  const layerById = new Map(context.layers.map((item) => [item.layer, item]));
  return RESEARCH_MODULES.map(([id, title]) => {
    if (id === "fundamental_core") return { id, title, status: layerById.get("fundamental")?.status ?? "unavailable", coverage: result.dataCoverage, confidence: result.scores.confidence, dataAsOf: result.diagnostics.latestFinancialPeriodEnd, findings: context.evidence.length ? [{ statement: report.summary, evidenceIds: context.evidence.map((item) => item.id), confidence: result.scores.confidence }] : [], positiveSignals: context.quality.positiveSignals.map((item) => item.statement), negativeSignals: context.quality.negativeSignals.map((item) => item.statement), unknowns: result.missingData.map((item) => item.reason), sources: context.evidence };
    if (id === "news_material_events") return { id, title, status: layerById.get("filings_events")?.status ?? "unavailable", coverage: layerById.get("filings_events")?.coverage ?? 0, confidence: layerById.get("filings_events")?.confidence ?? 0, dataAsOf: layerById.get("filings_events")?.dataAsOf ?? null, findings: context.events.map((event) => ({ statement: `${event.form} filed ${event.filingDate}${event.items.length ? ` with items ${event.items.join(", ")}` : ""}.`, evidenceIds: layerById.get("filings_events")?.evidenceIds ?? [], confidence: 95 })), positiveSignals: [], negativeSignals: [], unknowns: context.events.length ? [] : ["No classifiable recent SEC filing events were returned."], sources: context.evidence.filter((item) => item.sourceTier === "regulatory_filing") };
    if (id === "inflection_turnaround") return { id, title, status: context.inflection.score === null ? "unavailable" : "available", coverage: context.inflection.coverage, confidence: context.inflection.confidence, dataAsOf: result.diagnostics.latestFinancialPeriodEnd, findings: [], positiveSignals: context.inflection.positiveSignals.map((item) => item.statement), negativeSignals: context.inflection.negativeSignals.map((item) => item.statement), unknowns: context.inflection.score === null ? ["Too few comparable periods and signals."] : [], sources: context.evidence };
    if (id === "advanced_valuation_scenarios") return { id, title, status: context.opportunity.score === null ? "partial" : "available", coverage: context.opportunity.coverage, confidence: context.opportunity.confidence, dataAsOf: result.diagnostics.marketPriceDate ?? null, findings: [], positiveSignals: context.opportunity.positiveSignals.map((item) => item.statement), negativeSignals: context.opportunity.negativeSignals.map((item) => item.statement), unknowns: context.opportunity.score === null ? ["Verified valuation coverage is insufficient."] : [], sources: context.evidence };
    return { id, title, status: "unavailable", coverage: 0, confidence: 0, dataAsOf: null, findings: [], positiveSignals: [], negativeSignals: [], unknowns: [`${title} requires a configured specialist research provider.`], sources: [] };
  });
}

export function buildResearchResult(report: AnalysisReport, result: FinancialAnalysisResult, input?: FinancialAnalysisInput, resources: DeepResearchResources = {}): ResearchResult {
  const coreEvidence = evidenceFromSources(report.sources);
  const evidence = [...coreEvidence, ...(resources.filings?.evidence ?? [])];
  const quality = scoreWithEvidence(computeQualityScore(result), coreEvidence);
  const inflection = scoreWithEvidence(inflectionResearchScore(result, input, resources.market), coreEvidence);
  const opportunity = scoreWithEvidence(computeOpportunityScore(result, quality, inflection, resources.market), coreEvidence);
  const layers = researchLayers(result, resources, evidence);
  const coverage = layers.reduce((sum, item) => sum + item.coverage * LAYER_WEIGHTS[item.layer], 0);
  const confidence = layers.reduce((sum, item) => sum + item.confidence * item.coverage * LAYER_WEIGHTS[item.layer], 0);
  const signals = [...quality.positiveSignals, ...quality.negativeSignals, ...opportunity.positiveSignals, ...opportunity.negativeSignals, ...inflection.positiveSignals, ...inflection.negativeSignals];
  const inflectionDetail = computeInflectionScore(result.metrics);
  const base = { evidence, quality, opportunity, inflection, inflectionDetail, confidence: Math.round(confidence), coverage, layers, signals, events: resources.filings?.events ?? [], positives: signals.filter((item) => item.direction === "positive"), negatives: signals.filter((item) => item.direction === "negative"), changes: [...inflection.positiveSignals, ...inflection.negativeSignals], generatedAt: report.generatedAt };
  return { ...base, modules: moduleResults(report, result, base) };
}

export function computeMultiScores(result: FinancialAnalysisResult, input?: FinancialAnalysisInput, market?: MarketSnapshot | null): MultiScoreResult {
  const quality = computeQualityScore(result); const inflection = inflectionResearchScore(result, input, market); const opportunity = computeOpportunityScore(result, quality, inflection, market);
  const direction = inflection.score === null ? "unknown" : inflection.score > 58 ? "positive" : inflection.score < 42 ? "negative" : "mixed";
  return { businessQualityScore: quality.score, opportunityScore: opportunity.score, inflectionScore: { inflectionScore: inflection.score, direction, confidence: inflection.confidence, supportingSignals: inflection.positiveSignals.map((item) => item.statement), contradictingSignals: inflection.negativeSignals.map((item) => item.statement), estimatedStage: direction === "negative" ? "deteriorating" : direction === "positive" ? "early_turnaround" : direction === "mixed" ? "bottoming" : "unknown" }, riskScore: result.scores.dimensions.risk.score };
}

export function buildResearchPlan(report: AnalysisReport, result: FinancialAnalysisResult): ResearchPlan {
  return { investmentHorizon: report.investmentProfile === "short_term" ? "short" : report.investmentProfile === "long_term" ? "long" : "unspecified", nextSuggestedReview: "After the next reported financial period or a material company event.", whatToWatch: [...result.redFlags.slice(0, 3).map((item) => item.label), ...result.missingData.slice(0, 3).map((item) => `Obtain ${item.field}`)], improveCase: result.scenarios.find((item) => item.name === "Bull")?.drivers ?? [], weakenCase: result.scenarios.find((item) => item.name === "Bear")?.risks ?? result.redFlags.map((item) => item.label), invalidationTriggers: result.redFlags.filter((item) => item.severity === "critical" || item.severity === "high").map((item) => item.label), upcomingEvents: [], valuationReviewZone: result.dcf.status === "available" && result.dcf.low !== null && result.dcf.high !== null ? `${result.dcf.low.toFixed(2)}-${result.dcf.high.toFixed(2)} ${result.dcf.currency ?? ""}`.trim() : null };
}

function deepSection(id: DeepSectionId, title: string, report: AnalysisReport, result: FinancialAnalysisResult, research: ResearchResult): DeepReportSection {
  const finding = (statement: string, evidenceIds = research.evidence.map((item) => item.id)): ResearchFinding => ({ statement, evidenceIds, confidence: research.confidence });
  if (id === "executive_thesis") return { id, title, status: result.dataStatus === "current" ? "available" : "partial", findings: [finding(report.oneSentence)], unknowns: [] };
  if (id === "historical_financial_trend") return { id, title, status: result.metrics.latestPeriod ? "available" : "unavailable", findings: result.metrics.latestPeriod ? [finding(`Latest financial period ends ${result.metrics.latestPeriod.periodEndDate ?? "on an unavailable date"}.`)] : [], unknowns: result.metrics.latestPeriod ? [] : ["Historical financial periods are unavailable."] };
  if (id === "growth_quality") return { id, title, status: result.metrics.growth.revenueGrowthYoY === null ? "unavailable" : "available", findings: result.metrics.growth.revenueGrowthYoY === null ? [] : [finding(`Revenue growth is ${(result.metrics.growth.revenueGrowthYoY * 100).toFixed(1)}% on the ${result.metrics.growth.revenueGrowthBasis} basis.`)], unknowns: result.metrics.growth.revenueGrowthYoY === null ? ["Comparable revenue growth is unavailable."] : [] };
  if (id === "margin_development") { const margins = research.changes.filter((item) => item.metric.toLowerCase().includes("margin")); return { id, title, status: margins.length ? "available" : "unavailable", findings: margins.map((item) => finding(item.statement, item.evidenceIds)), unknowns: margins.length ? [] : ["Comparable margin periods are unavailable."] }; }
  if (id === "valuation") return { id, title, status: research.opportunity.score === null ? "partial" : "available", findings: research.opportunity.positiveSignals.map((item) => finding(item.statement, item.evidenceIds)), unknowns: research.opportunity.score === null ? ["Opportunity coverage is insufficient."] : [] };
  if (id === "risk_analysis") return { id, title, status: "available", findings: result.redFlags.map((item) => finding(item.label)), unknowns: [] };
  if (id === "catalysts") return { id, title, status: research.events.length ? "partial" : "unavailable", findings: research.events.map((event) => finding(`${event.form} filed ${event.filingDate}.`, research.layers.find((item) => item.layer === "filings_events")?.evidenceIds ?? [])), unknowns: research.events.length ? [] : ["No verified event catalyst data is available."] };
  if (id === "scenarios") return { id, title, status: result.scenarioStatus === "insufficient_data" ? "unavailable" : "available", findings: result.scenarios.map((item) => finding(`${item.name}: ${item.qualitativeOutcome}`)), unknowns: result.scenarioStatus === "insufficient_data" ? ["Coverage and valuation support are insufficient for scenarios."] : [] };
  if (id === "data_confidence") return { id, title, status: "available", findings: [finding(`Research coverage is ${(research.coverage * 100).toFixed(0)}% and confidence is ${research.confidence}%.`)], unknowns: [] };
  if (id === "sources_provenance") return { id, title, status: research.evidence.length ? "available" : "unavailable", findings: [], unknowns: research.evidence.length ? [] : ["No auditable external source was attached."] };
  if (id === "missing_data") return { id, title, status: "available", findings: [], unknowns: result.missingData.map((item) => `${item.field}: ${item.reason}`) };
  return { id, title, status: "unavailable", findings: [], unknowns: [`${title} requires a configured research provider.`] };
}

export function buildDeepReport(report: AnalysisReport, result: FinancialAnalysisResult, research: ResearchResult): DeepReport { return { sections: DEEP_SECTIONS.map(([id, title]) => deepSection(id, title, report, result, research)) }; }

export function attachInstitutionalResearch(report: AnalysisReport, result: FinancialAnalysisResult, input?: FinancialAnalysisInput, resources: DeepResearchResources = {}): void {
  if (report.analysisType !== "deep" && report.analysisType !== "research") return;
  const research = buildResearchResult(report, result, input, resources);
  report.research = research; report.multiScores = computeMultiScores(result, input, resources.market);
  report.deepReport = buildDeepReport(report, result, research); report.researchPlan = buildResearchPlan(report, result);
}

const NEWS_PATTERNS: Array<[MaterialNewsEventType, RegExp, MaterialNewsEvent["direction"], string]> = [
  ["guidance_raise", /raise[sd]? guidance|guidance increase/i, "positive", "forward earnings"], ["guidance_cut", /cut[s]? guidance|lower(?:ed|s)? guidance/i, "negative", "forward earnings"], ["earnings", /earnings|quarterly results/i, "mixed", "revenue and earnings"], ["customer_win_loss", /customer win|new customer|customer loss|lost customer/i, "mixed", "revenue concentration"], ["major_order", /major order|large contract|contract award/i, "positive", "revenue backlog"], ["contract_loss", /contract loss|lost contract/i, "negative", "revenue"], ["acquisition", /acqui(?:res|red|sition)/i, "mixed", "capital allocation"], ["divestment", /divest(?:s|ment|ed)/i, "mixed", "portfolio mix"], ["capital_raise", /capital raise|share offering|debt offering/i, "mixed", "capital structure"], ["buyback", /buyback|share repurchase/i, "positive", "share count"], ["dividend_change", /dividend (?:increase|cut|suspend)/i, "mixed", "shareholder distributions"], ["management_change", /ceo|cfo|management change|resign/i, "mixed", "execution"], ["fda_ema_event", /\bfda\b|\bema\b|drug approval|clinical hold/i, "mixed", "product pipeline"], ["lawsuit_investigation", /lawsuit|investigation|subpoena/i, "negative", "legal costs"], ["credit_rating", /credit rating|downgrade|upgrade/i, "mixed", "funding cost"], ["cybersecurity_event", /cyber|data breach|ransomware/i, "negative", "operating risk"], ["factory_supply_disruption", /factory shutdown|supply disruption|production halt/i, "negative", "production and revenue"], ["product_launch", /product launch|launches/i, "positive", "revenue"], ["short_seller_report", /short.seller|short report/i, "negative", "market confidence"], ["geopolitical_exposure_event", /sanction|war|geopolitical|export ban/i, "negative", "geographic exposure"], ["regulatory_event", /regulator|regulatory|antitrust/i, "mixed", "regulatory costs"],
];

export function classifyMaterialNews(headline: string, evidence: ResearchEvidence): MaterialNewsEvent {
  const match = NEWS_PATTERNS.find(([, pattern]) => pattern.test(headline)); const eventType = match?.[0] ?? "unclassified";
  const highQuality = ["regulatory_filing", "company_ir", "official_regulator", "exchange"].includes(evidence.sourceTier);
  return { eventType, materiality: eventType === "unclassified" ? "low" : /guidance|acquisition|fda|lawsuit|cyber|disruption|contract_loss/.test(eventType) ? "high" : "medium", direction: match?.[2] ?? "neutral", confidence: highQuality ? 85 : evidence.sourceTier === "reputable_news" ? 65 : 35, timeHorizon: /guidance|earnings|order|loss|cyber|disruption/.test(eventType) ? "near_term" : eventType === "unclassified" ? "unknown" : "medium_term", affectedFinancialDriver: match?.[3] ?? null, evidence };
}

export function analyzeInsiderTransactions(transactions: InsiderTransaction[]): InsiderContextResult {
  const openBuys = transactions.filter((item) => item.transactionType === "open_market_buy"); const discretionarySells = transactions.filter((item) => item.transactionType === "open_market_sell" && !item.automaticPlan);
  const clusterBuying = new Set(openBuys.map((item) => item.insiderRole).filter(Boolean)).size >= 2; const clusterSelling = new Set(discretionarySells.map((item) => item.insiderRole).filter(Boolean)).size >= 3;
  const findings: string[] = []; if (clusterBuying) findings.push("Multiple insider roles reported open-market purchases."); if (clusterSelling) findings.push("Multiple insider roles reported discretionary open-market sales."); if (transactions.some((item) => item.transactionType === "automatic_plan" || item.automaticPlan)) findings.push("Automatic-plan transactions are separated from discretionary activity.");
  const direction = clusterBuying && clusterSelling ? "mixed" : clusterBuying ? "positive" : clusterSelling ? "negative" : transactions.length ? "neutral" : "unknown";
  return { direction, confidence: Math.min(90, transactions.length * 12), clusterBuying, clusterSelling, findings };
}
