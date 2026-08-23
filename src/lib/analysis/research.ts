import { clamp, isFiniteNumber } from "./math";
import type {
  AnalysisReport,
  AnalysisSource,
  DeepReport,
  DeepReportSection,
  DeepSectionId,
  FinancialAnalysisResult,
  FinancialMetrics,
  InflectionScoreResult,
  InsiderContextResult,
  InsiderTransaction,
  MaterialNewsEvent,
  MaterialNewsEventType,
  MultiScoreResult,
  ResearchEvidence,
  ResearchModuleId,
  ResearchModuleResult,
  ResearchPlan,
  ResearchResult,
  SourceTier,
} from "./types";

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

function sourceTier(source: AnalysisSource): SourceTier {
  const name = source.name.toLowerCase();
  if (name.includes("sec") || name.includes("filing")) return "regulatory_filing";
  if (name.includes("investor relations") || name.includes("earnings release")) return "company_ir";
  if (name.includes("exchange")) return "exchange";
  return "financial_provider";
}

export function evidenceFromSources(sources: AnalysisSource[]): ResearchEvidence[] {
  return sources.map((source, index) => ({
    id: `source-${index + 1}`,
    kind: sourceTier(source) === "regulatory_filing" ? "reported_fact" : "external_estimate",
    sourceTier: sourceTier(source),
    title: source.name,
    source,
    dataAsOf: source.accessedAt,
  }));
}

export function computeInflectionScore(metrics: FinancialMetrics): InflectionScoreResult {
  const supportingSignals: string[] = [];
  const contradictingSignals: string[] = [];
  const signals: number[] = [];
  const add = (value: number | null, positive: string, negative: string, threshold = 0) => {
    if (!isFiniteNumber(value)) return;
    if (value > threshold) { signals.push(1); supportingSignals.push(positive); }
    else if (value < -threshold) { signals.push(-1); contradictingSignals.push(negative); }
  };
  add(metrics.trends.revenueAcceleration, "Revenue growth is accelerating.", "Revenue growth is decelerating.", 0.01);
  add(metrics.trends.operatingMarginChangeYoY, "Operating margin is expanding.", "Operating margin is contracting.", 0.01);
  add(metrics.trends.grossMarginChangeYoY, "Gross margin is recovering.", "Gross margin is weakening.", 0.01);
  if (isFiniteNumber(metrics.latestPeriod?.freeCashFlow) && isFiniteNumber(metrics.previousPeriod?.freeCashFlow)) {
    if (metrics.previousPeriod.freeCashFlow < 0 && metrics.latestPeriod.freeCashFlow > 0) {
      signals.push(1); supportingSignals.push("Free cash flow moved from negative to positive.");
    }
  }
  if (isFiniteNumber(metrics.trends.sharesDilutionYoY)) {
    if (metrics.trends.sharesDilutionYoY < 0.01) { signals.push(1); supportingSignals.push("Share dilution is limited or declining."); }
    else if (metrics.trends.sharesDilutionYoY > 0.05) { signals.push(-1); contradictingSignals.push("Share dilution is elevated."); }
  }
  if (!signals.length) return { inflectionScore: null, direction: "unknown", confidence: 0, supportingSignals, contradictingSignals, estimatedStage: "unknown" };
  const average = signals.reduce((sum, value) => sum + value, 0) / signals.length;
  const inflectionScore = Math.round(clamp(50 + average * 35, 0, 100));
  const direction = average > 0.2 ? "positive" : average < -0.2 ? "negative" : "mixed";
  const estimatedStage = direction === "negative" ? "deteriorating"
    : inflectionScore >= 75 && supportingSignals.length >= 3 ? "accelerating"
    : inflectionScore >= 65 ? "confirmed_turnaround"
    : direction === "positive" ? "early_turnaround" : "bottoming";
  return { inflectionScore, direction, confidence: Math.round(Math.min(100, signals.length / 8 * 100)), supportingSignals, contradictingSignals, estimatedStage };
}

export function computeMultiScores(result: FinancialAnalysisResult): MultiScoreResult {
  const dimensions = result.scores.dimensions;
  const businessQualityScore = dimensions.quality?.score ?? dimensions.profitability?.score ?? null;
  const valuation = dimensions.valuation?.score ?? null;
  const momentum = dimensions.momentum?.score ?? null;
  const opportunityScore = [businessQualityScore, valuation, momentum, result.scores.stockBoxScore].every(isFiniteNumber)
    ? Math.round((businessQualityScore as number) * 0.3 + (valuation as number) * 0.3 + (momentum as number) * 0.15 + (result.scores.stockBoxScore as number) * 0.25)
    : null;
  return {
    businessQualityScore,
    opportunityScore,
    inflectionScore: computeInflectionScore(result.metrics),
    riskScore: dimensions.risk?.score ?? null,
  };
}

export function buildResearchPlan(report: AnalysisReport, result: FinancialAnalysisResult): ResearchPlan {
  return {
    investmentHorizon: report.investmentProfile === "short_term" ? "short" : report.investmentProfile === "long_term" ? "long" : "unspecified",
    nextSuggestedReview: "After the next reported financial period or a material company event.",
    whatToWatch: [
      ...result.redFlags.slice(0, 3).map((flag) => flag.label),
      ...result.missingData.slice(0, 3).map((item) => `Obtain ${item.field}`),
    ],
    improveCase: result.scenarios.find((scenario) => scenario.name === "Bull")?.drivers ?? [],
    weakenCase: result.scenarios.find((scenario) => scenario.name === "Bear")?.risks ?? result.redFlags.map((flag) => flag.label),
    invalidationTriggers: result.redFlags.filter((flag) => flag.severity === "critical" || flag.severity === "high").map((flag) => flag.label),
    upcomingEvents: [],
    valuationReviewZone: result.dcf.status === "available" && result.dcf.low !== null && result.dcf.high !== null
      ? `${result.dcf.low.toFixed(2)}-${result.dcf.high.toFixed(2)} ${result.dcf.currency ?? ""}`.trim()
      : null,
  };
}

function deepSection(id: DeepSectionId, title: string, report: AnalysisReport, result: FinancialAnalysisResult, evidenceIds: string[]): DeepReportSection {
  const finding = (statement: string) => ({ statement, evidenceIds, confidence: report.score.confidence });
  if (id === "executive_thesis") return { id, title, status: result.dataStatus === "current" ? "available" : "partial", findings: [finding(report.oneSentence)], unknowns: [] };
  if (id === "historical_financial_trend") return { id, title, status: result.metrics.latestPeriod ? "available" : "unavailable", findings: result.metrics.latestPeriod ? [finding(`Latest financial period ends ${result.metrics.latestPeriod.periodEndDate ?? "on an unavailable date"}.`)] : [], unknowns: result.metrics.latestPeriod ? [] : ["Historical financial periods are unavailable."] };
  if (id === "growth_quality") return { id, title, status: result.metrics.growth.revenueGrowthYoY === null ? "unavailable" : "available", findings: result.metrics.growth.revenueGrowthYoY === null ? [] : [finding(`Revenue growth is ${(result.metrics.growth.revenueGrowthYoY * 100).toFixed(1)}% on the ${result.metrics.growth.revenueGrowthBasis} basis.`)], unknowns: result.metrics.growth.revenueGrowthYoY === null ? ["Comparable revenue growth is unavailable."] : [] };
  if (id === "margin_development") return { id, title, status: result.metrics.trends.operatingMarginChangeYoY === null ? "unavailable" : "available", findings: result.metrics.trends.operatingMarginChangeYoY === null ? [] : [finding(`Operating margin changed by ${(result.metrics.trends.operatingMarginChangeYoY * 100).toFixed(1)} percentage points.`)], unknowns: result.metrics.trends.operatingMarginChangeYoY === null ? ["Comparable operating margin is unavailable or unsuitable."] : [] };
  if (id === "valuation") return { id, title, status: result.dcf.status === "available" ? "available" : Object.values(result.metrics.valuation).some(isFiniteNumber) ? "partial" : "unavailable", findings: result.dcf.status === "available" ? [finding(`DCF range is ${result.dcf.low?.toFixed(2)}-${result.dcf.high?.toFixed(2)} ${result.dcf.currency ?? ""}.`)] : [], unknowns: result.dcf.status === "available" ? [] : [result.dcf.reason ?? "Valuation inputs are unavailable."] };
  if (id === "risk_analysis") return { id, title, status: "available", findings: result.redFlags.map((flag) => finding(flag.label)), unknowns: [] };
  if (id === "scenarios") return { id, title, status: result.scenarioStatus === "insufficient_data" ? "unavailable" : "available", findings: result.scenarios.map((scenario) => finding(`${scenario.name}: ${scenario.qualitativeOutcome}`)), unknowns: result.scenarioStatus === "insufficient_data" ? ["Coverage and valuation support are insufficient for scenarios."] : [] };
  if (id === "data_confidence") return { id, title, status: "available", findings: [finding(`Weighted data coverage is ${(result.dataCoverage * 100).toFixed(0)}% and confidence is ${result.scores.confidence}%.`)], unknowns: [] };
  if (id === "sources_provenance") return { id, title, status: evidenceIds.length ? "available" : "unavailable", findings: [], unknowns: evidenceIds.length ? [] : ["No auditable external source was attached."] };
  if (id === "missing_data") return { id, title, status: "available", findings: [], unknowns: result.missingData.map((item) => `${item.field}: ${item.reason}`) };
  return { id, title, status: "unavailable", findings: [], unknowns: [`${title} requires a configured research provider.`] };
}

export function buildDeepReport(report: AnalysisReport, result: FinancialAnalysisResult, evidence: ResearchEvidence[]): DeepReport {
  const evidenceIds = evidence.map((item) => item.id);
  return { sections: DEEP_SECTIONS.map(([id, title]) => deepSection(id, title, report, result, evidenceIds)) };
}

export function buildResearchResult(report: AnalysisReport, result: FinancialAnalysisResult, evidence: ResearchEvidence[]): ResearchResult {
  const evidenceIds = evidence.map((item) => item.id);
  const inflection = computeInflectionScore(result.metrics);
  const modules: ResearchModuleResult[] = RESEARCH_MODULES.map(([id, title]) => {
    if (id === "fundamental_core") return {
      id, title, status: result.dataCoverage >= 0.5 ? "available" : "partial", coverage: result.dataCoverage,
      confidence: result.scores.confidence, dataAsOf: result.diagnostics.latestFinancialPeriodEnd,
      findings: evidenceIds.length ? [{ statement: report.summary, evidenceIds, confidence: result.scores.confidence }] : [],
      positiveSignals: report.greenFlags.map((flag) => flag.title), negativeSignals: report.redFlags.map((flag) => flag.title),
      unknowns: result.missingData.map((item) => item.reason), sources: evidence,
    };
    if (id === "inflection_turnaround") return {
      id, title, status: inflection.inflectionScore === null ? "unavailable" : "available", coverage: inflection.confidence / 100,
      confidence: inflection.confidence, dataAsOf: result.diagnostics.latestFinancialPeriodEnd, findings: [],
      positiveSignals: inflection.supportingSignals, negativeSignals: inflection.contradictingSignals,
      unknowns: inflection.inflectionScore === null ? ["Comparable trend signals are unavailable."] : [], sources: evidence,
    };
    if (id === "advanced_valuation_scenarios") return {
      id, title, status: result.scenarioStatus === "insufficient_data" ? "unavailable" : result.dcf.status === "available" ? "available" : "partial",
      coverage: result.confidenceBreakdown.valuationInputs, confidence: result.scores.confidence,
      dataAsOf: result.diagnostics.marketPriceDate ?? null, findings: [], positiveSignals: [], negativeSignals: [],
      unknowns: result.scenarioStatus === "insufficient_data" ? ["Valuation and scenario coverage are insufficient."] : result.dcf.status === "available" ? [] : [result.dcf.reason ?? "Valuation inputs are unavailable."], sources: evidence,
    };
    return { id, title, status: "unavailable", coverage: 0, confidence: 0, dataAsOf: null, findings: [], positiveSignals: [], negativeSignals: [], unknowns: [`${title} requires a configured specialist research provider.`], sources: [] };
  });
  return { modules, evidence, inflection, generatedAt: report.generatedAt };
}

export function attachInstitutionalResearch(report: AnalysisReport, result: FinancialAnalysisResult): void {
  const evidence = evidenceFromSources(report.sources);
  report.multiScores = computeMultiScores(result);
  if (report.analysisType === "deep" || report.analysisType === "research") {
    report.deepReport = buildDeepReport(report, result, evidence);
    report.researchPlan = buildResearchPlan(report, result);
  }
  if (report.analysisType === "research") report.research = buildResearchResult(report, result, evidence);
}

const NEWS_PATTERNS: Array<[MaterialNewsEventType, RegExp, MaterialNewsEvent["direction"], string]> = [
  ["guidance_raise", /raise[sd]? guidance|guidance increase/i, "positive", "forward earnings"],
  ["guidance_cut", /cut[s]? guidance|lower(?:ed|s)? guidance/i, "negative", "forward earnings"],
  ["earnings", /earnings|quarterly results/i, "mixed", "revenue and earnings"],
  ["customer_win_loss", /customer win|new customer|customer loss|lost customer/i, "mixed", "revenue concentration"],
  ["major_order", /major order|large contract|contract award/i, "positive", "revenue backlog"],
  ["contract_loss", /contract loss|lost contract|customer loss/i, "negative", "revenue"],
  ["acquisition", /acqui(?:res|red|sition)/i, "mixed", "capital allocation"],
  ["divestment", /divest(?:s|ment|ed)/i, "mixed", "portfolio mix"],
  ["capital_raise", /capital raise|share offering|debt offering/i, "mixed", "capital structure"],
  ["buyback", /buyback|share repurchase/i, "positive", "share count"],
  ["dividend_change", /dividend (?:increase|cut|suspend)/i, "mixed", "shareholder distributions"],
  ["management_change", /ceo|cfo|management change|resign/i, "mixed", "execution"],
  ["fda_ema_event", /\bfda\b|\bema\b|drug approval|clinical hold/i, "mixed", "product pipeline"],
  ["lawsuit_investigation", /lawsuit|investigation|subpoena/i, "negative", "legal costs"],
  ["credit_rating", /credit rating|downgrade|upgrade/i, "mixed", "funding cost"],
  ["cybersecurity_event", /cyber|data breach|ransomware/i, "negative", "operating risk"],
  ["factory_supply_disruption", /factory shutdown|supply disruption|production halt/i, "negative", "production and revenue"],
  ["product_launch", /product launch|launches/i, "positive", "revenue"],
  ["short_seller_report", /short.seller|short report/i, "negative", "market confidence"],
  ["geopolitical_exposure_event", /sanction|war|geopolitical|export ban/i, "negative", "geographic exposure"],
  ["regulatory_event", /regulator|regulatory|antitrust/i, "mixed", "regulatory costs"],
];

export function classifyMaterialNews(headline: string, evidence: ResearchEvidence): MaterialNewsEvent {
  const match = NEWS_PATTERNS.find(([, pattern]) => pattern.test(headline));
  const eventType = match?.[0] ?? "unclassified";
  const quality = ["regulatory_filing", "company_ir", "official_regulator", "exchange"].includes(evidence.sourceTier);
  return {
    eventType,
    materiality: eventType === "unclassified" ? "low" : /guidance|acquisition|fda|lawsuit|cyber|disruption|contract_loss/.test(eventType) ? "high" : "medium",
    direction: match?.[2] ?? "neutral",
    confidence: quality ? 85 : evidence.sourceTier === "reputable_news" ? 65 : 35,
    timeHorizon: /guidance|earnings|order|loss|cyber|disruption/.test(eventType) ? "near_term" : eventType === "unclassified" ? "unknown" : "medium_term",
    affectedFinancialDriver: match?.[3] ?? null,
    evidence,
  };
}

export function analyzeInsiderTransactions(transactions: InsiderTransaction[]): InsiderContextResult {
  const openBuys = transactions.filter((item) => item.transactionType === "open_market_buy");
  const discretionarySells = transactions.filter((item) => item.transactionType === "open_market_sell" && !item.automaticPlan);
  const clusterBuying = new Set(openBuys.map((item) => item.insiderRole).filter(Boolean)).size >= 2;
  const clusterSelling = new Set(discretionarySells.map((item) => item.insiderRole).filter(Boolean)).size >= 3;
  const findings: string[] = [];
  if (clusterBuying) findings.push("Multiple insider roles reported open-market purchases.");
  if (clusterSelling) findings.push("Multiple insider roles reported discretionary open-market sales.");
  if (transactions.some((item) => item.transactionType === "automatic_plan" || item.automaticPlan)) findings.push("Automatic-plan transactions are separated from discretionary activity.");
  const direction = clusterBuying && clusterSelling ? "mixed" : clusterBuying ? "positive" : clusterSelling ? "negative" : transactions.length ? "neutral" : "unknown";
  return { direction, confidence: Math.min(90, transactions.length * 12), clusterBuying, clusterSelling, findings };
}
