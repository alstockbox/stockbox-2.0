import { randomUUID } from "node:crypto";
import { resolveArchetype } from "./archetypes";
import { MODEL_VERSION, REPORT_SCHEMA_VERSION } from "./config";
import { computeDcfRange } from "./dcf";
import { detectFinancialRedFlags } from "./flags";
import { isFiniteNumber } from "./math";
import { computeFinancialMetrics } from "./metrics";
import { deriveRecommendation } from "./recommendation";
import { reconcileFinancialData, reconciliationConfidence } from "./reconciliation";
import { buildAnalysisScenarios } from "./scenarios";
import { computeScores } from "./scoring";
import type {
  AnalysisInput,
  AnalysisReport,
  AnnualFinancials,
  FinancialAnalysisInput,
  FinancialAnalysisResult,
  FinancialPeriod,
  Flag,
  Metrics,
  MissingDataItem,
  Sector,
} from "./types";

const DISCLAIMER =
  "StockBox is an analytical tool. Scores and model ratings depend on available data, explicit assumptions, and historical relationships. They are not individualized financial advice or guaranteed outcomes.";

const sectors = new Set<Sector>([
  "technology", "financials", "healthcare", "consumer", "industrials", "energy", "utilities",
  "realEstate", "materials", "communication", "other",
]);

function toSector(value: string | null | undefined): Sector | undefined {
  return value && sectors.has(value as Sector) ? value as Sector : undefined;
}

function mapLegacyPeriod(period: AnnualFinancials): FinancialPeriod {
  return {
    fiscalYear: period.fiscalYear,
    periodEndDate: period.periodEndDate,
    revenue: period.revenue,
    grossProfit: period.grossProfit,
    costOfRevenue: period.costOfRevenue,
    operatingIncome: period.operatingIncome,
    ebitda: period.ebitda,
    netIncome: period.netIncome,
    epsDiluted: period.epsDiluted,
    operatingCashFlow: period.operatingCashFlow,
    capitalExpenditures: period.capex,
    totalAssets: period.assets,
    totalLiabilities: period.liabilities,
    cashAndEquivalents: period.cash,
    totalDebt: period.debt,
    totalEquity: period.equity,
    currentAssets: period.currentAssets,
    currentLiabilities: period.currentLiabilities,
    interestExpense: period.interestExpense,
    pretaxIncome: period.pretaxIncome,
    incomeTaxExpense: period.incomeTaxExpense,
    dividendsPaid: period.dividendsPaid,
    stockBasedCompensation: period.stockBasedCompensation,
    researchAndDevelopment: period.researchAndDevelopment,
    sharesDiluted: period.sharesDiluted,
    currentSharesOutstanding: period.currentSharesOutstanding,
    provenance: period.provenance,
  };
}

export function toFinancialAnalysisInput(input: AnalysisInput): FinancialAnalysisInput {
  const fundamentals = input.fundamentals;
  return {
    company: {
      ticker: input.company.ticker,
      name: fundamentals?.name ?? input.company.name,
      sector: toSector(fundamentals?.sector),
      industry: fundamentals?.industry ?? undefined,
      investmentProfile: input.investmentProfile,
      analysisArchetype: fundamentals?.analysisArchetype,
      sic: fundamentals?.sic,
      currency: input.market?.currency ?? undefined,
    },
    annualPeriods: fundamentals?.annualPeriods ?? fundamentals?.annual.map(mapLegacyPeriod) ?? [],
    trailingTwelveMonths: fundamentals?.trailingTwelveMonths,
    market: input.market ? {
      price: input.market.price,
      currency: input.market.currency || null,
      priceDate: input.market.date,
      volume: input.market.volume,
      yearHigh: input.market.yearHigh,
      yearLow: input.market.yearLow,
      pricePerformance: {
        oneMonth: input.market.performance["1M"] ?? null,
        threeMonth: input.market.performance["3M"] ?? null,
        sixMonth: input.market.performance["6M"] ?? null,
        yearToDate: input.market.performance.YTD ?? null,
        oneYear: input.market.performance["1Y"] ?? null,
      },
    } : undefined,
    analysisDate: new Date().toISOString(),
    providerDiagnostics: input.providerDiagnostics ?? fundamentals?.diagnostics?.providerDiagnostics,
  };
}

function diagnosticDates(input: FinancialAnalysisInput) {
  const annualEnds = input.annualPeriods.map((period) => period.periodEndDate).filter((value): value is string => Boolean(value)).sort();
  const latestAnnualPeriodEnd = annualEnds.at(-1) ?? null;
  const latestFinancialPeriodEnd = input.trailingTwelveMonths?.periodEndDate ?? latestAnnualPeriodEnd;
  const analysisTime = Date.parse(input.analysisDate ?? new Date().toISOString());
  const periodTime = latestFinancialPeriodEnd ? Date.parse(latestFinancialPeriodEnd) : Number.NaN;
  return {
    latestFinancialPeriodEnd,
    latestAnnualPeriodEnd,
    dataAgeDays: Number.isFinite(periodTime) ? Math.max(0, Math.floor((analysisTime - periodTime) / 86_400_000)) : null,
    ttmStatus: input.trailingTwelveMonths ? "available" as const : input.annualPeriods.length ? "annual_fallback" as const : "unavailable" as const,
    providerDiagnostics: input.providerDiagnostics ?? [],
  };
}

export function analyzeFinancials(input: FinancialAnalysisInput): FinancialAnalysisResult {
  const metrics = computeFinancialMetrics(input);
  const reconciliation = reconcileFinancialData(input, metrics);
  const scores = computeScores(input, metrics, { reconciliation: reconciliationConfidence(reconciliation) });
  const archetype = resolveArchetype(input.company);
  const redFlags = detectFinancialRedFlags(metrics, archetype);
  const dcf = computeDcfRange(input, metrics);
  const recommendation = deriveRecommendation(scores, redFlags, dcf);
  const scenarios = buildAnalysisScenarios(metrics, scores, dcf);
  const missing = [...metrics.missingData, ...scores.missingData, ...dcf.missingData];
  for (const check of reconciliation.filter((item) => item.status === "warning")) {
    missing.push({ field: check.code, reason: check.message, impact: "score", severity: "high" });
  }
  const uniqueMissing = new Map<string, MissingDataItem>();
  for (const item of missing) uniqueMissing.set(`${item.field}:${item.impact}`, item);
  return {
    modelVersion: MODEL_VERSION,
    reportSchemaVersion: REPORT_SCHEMA_VERSION,
    analysisArchetype: archetype,
    metrics,
    scores,
    redFlags,
    recommendation,
    dcf,
    scenarios,
    missingData: [...uniqueMissing.values()],
    dataCoverage: scores.dataCoverage,
    confidenceBreakdown: scores.confidenceBreakdown,
    diagnostics: diagnosticDates(input),
    reconciliation,
    provenance: metrics.provenance,
  };
}

function legacyMetrics(result: FinancialAnalysisResult, input: FinancialAnalysisInput): Metrics {
  const m = result.metrics;
  return {
    revenueGrowth1y: m.growth.revenueGrowthYoY,
    revenueCagr3y: m.growth.revenueCagr3y,
    epsGrowth1y: m.growth.epsGrowthYoY,
    grossMargin: m.margins.grossMargin,
    operatingMargin: m.margins.operatingMargin,
    netMargin: m.margins.netMargin,
    fcf: m.cashFlow.simpleFreeCashFlow,
    fcfMargin: m.margins.freeCashFlowMargin,
    cashConversion: m.cashFlow.freeCashFlowToNetIncome,
    debtToEquity: m.ratios.debtToEquity,
    debtToAssets: isFiniteNumber(m.latestPeriod?.totalDebt) && isFiniteNumber(m.latestPeriod?.totalAssets)
      ? m.latestPeriod.totalDebt / m.latestPeriod.totalAssets
      : null,
    netDebt: m.ratios.netDebt,
    interestCoverage: m.ratios.interestCoverage,
    earningsYield: m.valuation.earningsYield,
    fcfYield: m.valuation.freeCashFlowYield,
    priceMomentum1y: input.market?.pricePerformance?.oneYear ?? null,
    priceMomentum3m: input.market?.pricePerformance?.threeMonth ?? null,
  };
}

function greenFlags(metrics: Metrics): Flag[] {
  const flags: Flag[] = [];
  if (metrics.revenueCagr3y !== null && metrics.revenueCagr3y > 0.1) flags.push({ severity: "low", title: "Durable revenue growth", detail: "Three-year revenue growth is strong.", metric: "revenueCagr3y" });
  if (metrics.operatingMargin !== null && metrics.operatingMargin > 0.2) flags.push({ severity: "low", title: "Strong operating margin", detail: "Operating profitability is strong relative to revenue.", metric: "operatingMargin" });
  if (metrics.fcfMargin !== null && metrics.fcfMargin > 0.12) flags.push({ severity: "low", title: "Strong simple FCF margin", detail: "CFO after economic capex is strong relative to revenue.", metric: "fcfMargin" });
  return flags;
}

export function presentAnalysisReport(
  legacyInput: AnalysisInput,
  canonicalInput: FinancialAnalysisInput,
  result: FinancialAnalysisResult,
): AnalysisReport {
  const metrics = legacyMetrics(result, canonicalInput);
  const redFlags: Flag[] = result.redFlags.map((flag) => ({
    severity: flag.severity,
    title: flag.label,
    detail: flag.rationale,
    metric: flag.metric && flag.metric in metrics ? flag.metric as keyof Metrics : undefined,
  }));
  const score = result.scores.stockBoxScore;
  const rating = result.recommendation.rating;
  const companyName = canonicalInput.company.name ?? legacyInput.company.name;
  const report: AnalysisReport = {
    id: randomUUID(),
    ticker: legacyInput.company.ticker,
    companyName,
    analysisType: legacyInput.analysisType,
    investmentProfile: legacyInput.investmentProfile,
    generatedAt: canonicalInput.analysisDate ?? new Date().toISOString(),
    oneSentence: score === null
      ? `${companyName} receives No Rating because weighted data coverage is insufficient.`
      : `${companyName} receives a ${rating} model rating with a StockBox Score of ${Math.round(score)}/100 and ${result.scores.confidence}% confidence.`,
    summary: rating === "No Rating"
      ? "StockBox does not have enough suitable, reconciled data for a directional model rating. Available facts and missing-data reasons remain visible."
      : `${companyName} is rated ${rating} by the versioned StockBox model. The rating separates business quality from valuation coverage and data confidence.`,
    recommendation: rating,
    shortTermAssessment: result.scores.shortTermScore === null
      ? "Short-term assessment is unavailable because market and risk coverage is insufficient."
      : `Short-term model score is ${result.scores.shortTermScore}/100; this does not alter the canonical financial facts.`,
    longTermAssessment: result.scores.longTermScore === null
      ? "Long-term assessment is unavailable because fundamental coverage is insufficient."
      : `Long-term model score is ${result.scores.longTermScore}/100, based on the same canonical facts as every report depth.`,
    metrics,
    score: {
      score,
      personalizedScore: result.scores.personalizedScore,
      confidence: result.scores.confidence,
      dimensions: Object.values(result.scores.dimensions),
      missingData: result.missingData.map((item) => `${item.field}: ${item.reason}`),
    },
    dcf: {
      suitable: result.dcf.status === "available",
      reason: result.dcf.reason,
      bear: result.dcf.low,
      base: result.dcf.mid,
      bull: result.dcf.high,
    },
    redFlags,
    greenFlags: greenFlags(metrics),
    scenarios: result.scenarios.map((scenario) => ({
      caseName: scenario.name,
      assumptions: scenario.assumptions,
      drivers: scenario.drivers,
      risks: scenario.risks,
      qualitativeOutcome: scenario.qualitativeOutcome,
      confidence: scenario.confidence,
    })),
    sources: [],
    disclaimer: DISCLAIMER,
    modelVersion: result.modelVersion,
    reportSchemaVersion: result.reportSchemaVersion,
    analysisArchetype: result.analysisArchetype,
    dataCoverage: result.dataCoverage,
    dataAsOf: result.diagnostics.latestFinancialPeriodEnd,
    confidenceBreakdown: result.confidenceBreakdown,
    providerDiagnostics: result.diagnostics.providerDiagnostics,
    engine: result,
  };
  return report;
}

/** Compatibility entry point. All calculations route through analyzeFinancials. */
export function buildAnalysis(input: AnalysisInput): AnalysisReport {
  const canonicalInput = toFinancialAnalysisInput(input);
  return presentAnalysisReport(input, canonicalInput, analyzeFinancials(canonicalInput));
}
