import { randomUUID } from "node:crypto";
import { resolveArchetype } from "./archetypes";
import { MODEL_VERSION, REPORT_SCHEMA_VERSION } from "./config";
import { computeDcfRange } from "./dcf";
import { detectArchetypeGreenFlags, detectFinancialRedFlags } from "./flags";
import { assessDataFreshness } from "./freshness";
import { isFiniteNumber } from "./math";
import { computeFinancialMetrics } from "./metrics";
import { deriveRecommendation } from "./recommendation";
import { reconcileFinancialData, reconciliationConfidence, ttmPeriodBasisCheck } from "./reconciliation";
import { attachInstitutionalResearch } from "./research";
import { buildAnalysisScenarios, scenarioStatusFor } from "./scenarios";
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
  SpecializedCompanyData,
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
      canonicalTicker: input.company.canonicalTicker,
      entityId: input.company.entityId,
      cik: input.company.cik,
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
    priorTrailingTwelveMonths: fundamentals?.priorTrailingTwelveMonths,
    market: input.market ? {
      price: input.market.price,
      currency: input.market.currency || null,
      priceDate: input.market.date,
      volume: input.market.volume,
      yearHigh: input.market.yearHigh,
      yearLow: input.market.yearLow,
      marketCap: input.market.marketCap,
      sharesOutstanding: input.market.sharesOutstanding,
      beta: input.market.beta,
      provider: input.market.provider,
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
    specialized: fundamentals?.specialized,
  };
}

function diagnosticDates(input: FinancialAnalysisInput, freshness = assessDataFreshness(input)) {
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
    financialFlowPeriodBasis: input.trailingTwelveMonths?.periodBasis ?? (latestAnnualPeriodEnd ? "FY" : null),
    ...freshness,
  };
}

function specializedMissingData(
  archetype: ReturnType<typeof resolveArchetype>,
  latest: FinancialPeriod | null,
  specialized?: SpecializedCompanyData,
): MissingDataItem[] {
  if (archetype === "bank") {
    const bankValues = specialized?.kind === "bank" ? {
      netInterestMargin: specialized.netInterestMargin.value,
      cet1CapitalRatio: specialized.cet1CapitalRatio.value,
      grossLoans: specialized.grossLoans.value,
      deposits: specialized.deposits.value,
      nonperformingLoans: specialized.nonPerformingLoans.value,
      netChargeOffs: specialized.netChargeOffs.value,
      tangibleCommonEquity: specialized.tangibleCommonEquity.value,
    } : {};
    return [
      ["netInterestMargin", "Net interest margin (NIM)"],
      ["cet1CapitalRatio", "CET1 capital ratio"],
      ["grossLoans", "Gross loans"],
      ["deposits", "Deposits"],
      ["nonperformingLoans", "Nonperforming loans"],
      ["netChargeOffs", "Net charge-offs"],
      ["tangibleCommonEquity", "Tangible common equity / tangible book value"],
    ].flatMap(([field, label]) => {
      if (isFiniteNumber(bankValues[field as keyof typeof bankValues])) return [];
      if (field === "tangibleCommonEquity" && isFiniteNumber(latest?.tangibleBookValue)) return [];
      return [{
        field,
        reason: `${label} is unavailable from the current specialized bank-data provider phase.`,
        impact: "metric" as const,
        severity: "medium" as const,
      }];
    });
  }
  if (archetype === "reit") {
    const missing: MissingDataItem[] = [];
    const reportedFfo = specialized?.kind === "reit" ? specialized.fundsFromOperations.value : latest?.fundsFromOperations;
    const reportedAffo = specialized?.kind === "reit" ? specialized.adjustedFundsFromOperations.value : latest?.adjustedFundsFromOperations;
    if (!isFiniteNumber(reportedFfo)) {
      missing.push({
        field: "fundsFromOperations",
        reason: "Provider-reported FFO is unavailable; GAAP EPS is not substituted for FFO.",
        impact: "metric",
        severity: "high",
      });
    }
    if (!isFiniteNumber(reportedAffo)) {
      missing.push({
        field: "adjustedFundsFromOperations",
        reason: "Provider-reported AFFO is unavailable; GAAP EPS is not substituted for AFFO.",
        impact: "metric",
        severity: "high",
      });
    }
    return missing;
  }
  return [];
}

export function analyzeFinancials(input: FinancialAnalysisInput): FinancialAnalysisResult {
  const ttmConsistency = ttmPeriodBasisCheck(input.trailingTwelveMonths);
  const consistencySafeInput = ttmConsistency.status === "warning"
    ? { ...input, trailingTwelveMonths: undefined, priorTrailingTwelveMonths: undefined }
    : input;
  const initialFreshness = assessDataFreshness(consistencySafeInput);
  const annualFallbackInput = consistencySafeInput.trailingTwelveMonths
    ? { ...consistencySafeInput, trailingTwelveMonths: undefined, priorTrailingTwelveMonths: undefined }
    : consistencySafeInput;
  const annualFallbackFreshness = assessDataFreshness(annualFallbackInput);
  const periodConsistentInput = consistencySafeInput.trailingTwelveMonths
    && initialFreshness.financialFlowStatus === "stale"
    && annualFallbackFreshness.dataStatus === "current"
    ? annualFallbackInput
    : consistencySafeInput;
  const freshness = periodConsistentInput === annualFallbackInput
    ? annualFallbackFreshness
    : initialFreshness;
  const calculationInput = freshness.dataStatus === "stale"
    ? { ...periodConsistentInput, annualPeriods: [], trailingTwelveMonths: undefined, priorTrailingTwelveMonths: undefined }
    : periodConsistentInput;
  const metrics = computeFinancialMetrics(calculationInput);
  const reconciliation = reconcileFinancialData(freshness.dataStatus === "stale" ? calculationInput : periodConsistentInput, metrics);
  if (ttmConsistency.status === "warning") {
    const ttmCheckIndex = reconciliation.findIndex((check) => check.code === ttmConsistency.code);
    if (ttmCheckIndex >= 0) reconciliation[ttmCheckIndex] = ttmConsistency;
    else reconciliation.unshift(ttmConsistency);
  }
  reconciliation.push({
    code: "fundamental_data_freshness",
    status: freshness.dataStatus === "stale" ? "warning" : freshness.dataStatus === "current" ? "pass" : "unavailable",
    message: freshness.dataStatus === "stale"
      ? "Latest reliable financial statements are too old for a current analysis."
      : freshness.dataStatus === "current"
        ? "Financial statements are within the current-analysis freshness threshold."
        : "Financial statement freshness could not be established.",
  });
  const computedScores = computeScores(calculationInput, metrics, { reconciliation: reconciliationConfidence(reconciliation) });
  const scores = freshness.dataStatus === "stale"
    ? { ...computedScores, stockBoxScore: null, personalizedScore: null, shortTermScore: null, longTermScore: null }
    : computedScores;
  const archetype = resolveArchetype(calculationInput.company);
  const redFlags = detectFinancialRedFlags(metrics, archetype);
  const dcf = computeDcfRange(calculationInput, metrics);
  const recommendation = deriveRecommendation(scores, redFlags, dcf);
  const scenarioStatus = freshness.dataStatus === "stale" ? "insufficient_data" : scenarioStatusFor(metrics, scores, dcf);
  const scenarios = freshness.dataStatus === "stale" ? [] : buildAnalysisScenarios(metrics, scores, dcf);
  const unsuitableCorporateFields = new Set(
    ["bank", "insurer", "reit"].includes(archetype)
      ? ["simpleFreeCashFlow", "enterpriseValue", "normalizedTaxRate"]
      : [],
  );
  const missing = [
    ...specializedMissingData(archetype, metrics.latestPeriod, calculationInput.specialized),
    ...metrics.missingData.filter((item) => !unsuitableCorporateFields.has(item.field)),
    ...scores.missingData.filter((item) => !unsuitableCorporateFields.has(item.field)),
    ...dcf.missingData,
  ];
  if (freshness.dataStatus === "stale") {
    missing.push({
      field: "staleFinancialData",
      reason: "Latest reliable financial statements are too old for a current analysis.",
      impact: "score",
      severity: "high",
    });
  }
  for (const check of reconciliation.filter((item) => item.status === "warning")) {
    missing.push({ field: check.code, reason: check.message, impact: "score", severity: "high" });
  }
  const uniqueMissing = new Map<string, MissingDataItem>();
  for (const item of missing) uniqueMissing.set(`${item.field}:${item.impact}`, item);
  return {
    modelVersion: MODEL_VERSION,
    reportSchemaVersion: REPORT_SCHEMA_VERSION,
    analysisArchetype: archetype,
    dataStatus: freshness.dataStatus,
    metrics,
    scores,
    redFlags,
    recommendation,
    dcf,
    scenarios,
    scenarioStatus,
    missingData: [...uniqueMissing.values()],
    dataCoverage: scores.dataCoverage,
    confidenceBreakdown: scores.confidenceBreakdown,
    diagnostics: diagnosticDates(periodConsistentInput, freshness),
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
    oneSentence: result.dataStatus === "stale"
      ? "Latest reliable financial statements are too old for a current analysis."
      : score === null
      ? `${companyName} receives No Rating because weighted data coverage is insufficient.`
      : `${companyName} receives a ${rating} model rating with a StockBox Score of ${Math.round(score)}/100 and ${result.scores.confidence}% confidence.`,
    summary: result.dataStatus === "stale"
      ? "StockBox has blocked scoring and opportunity conclusions because the latest reliable fundamentals exceed the hard freshness threshold."
      : rating === "No Rating"
      ? "StockBox does not have enough suitable, reconciled data for a directional model rating. Available facts and missing-data reasons remain visible."
      : `${companyName} is rated ${rating} by the versioned StockBox model. The rating separates business quality from valuation coverage and data confidence.`,
    recommendation: rating,
    shortTermAssessment: result.dataStatus === "stale"
      ? "No current short-term assessment is produced from stale financial statements."
      : result.scores.shortTermScore === null
      ? "Short-term assessment is unavailable because market and risk coverage is insufficient."
      : `Short-term model score is ${result.scores.shortTermScore}/100; this does not alter the canonical financial facts.`,
    longTermAssessment: result.dataStatus === "stale"
      ? "No current long-term assessment is produced from stale financial statements."
      : result.scores.longTermScore === null
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
    greenFlags: detectArchetypeGreenFlags(metrics, result.metrics, result.analysisArchetype, canonicalInput.specialized),
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
    dataStatus: result.dataStatus,
    confidenceBreakdown: result.confidenceBreakdown,
    providerDiagnostics: result.diagnostics.providerDiagnostics,
    scenarioStatus: result.scenarioStatus,
    engine: result,
  };
  attachInstitutionalResearch(report, result, canonicalInput, { market: legacyInput.market });
  return report;
}

/** Compatibility entry point. All calculations route through analyzeFinancials. */
export function buildAnalysis(input: AnalysisInput): AnalysisReport {
  const canonicalInput = toFinancialAnalysisInput(input);
  return presentAnalysisReport(input, canonicalInput, analyzeFinancials(canonicalInput));
}
