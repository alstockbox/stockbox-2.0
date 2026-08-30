import { createHash, randomUUID } from "node:crypto";
import { resolveFinancialArchetype } from "./archetypes";
import {
  MODEL_VERSION,
  REPORT_SCHEMA_VERSION,
  SCORE_POLICY_VERSION,
  STATIC_BENCHMARK_VERSION,
} from "./config";
import { computeDcfRange } from "./dcf";
import { detectArchetypeGreenFlags, detectFinancialRedFlags } from "./flags";
import { assessDataFreshness } from "./freshness";
import { isFiniteNumber } from "./math";
import { computeFinancialMetrics, valuationCurrencyAlignment } from "./metrics";
import { deriveRecommendation } from "./recommendation";
import { reconcileFinancialData, reconciliationConfidence, ttmPeriodBasisCheck } from "./reconciliation";
import { attachInstitutionalResearch } from "./research";
import { buildAnalysisScenarios, scenarioStatusFor } from "./scenarios";
import { computeScores } from "./scoring";
import { summarizeSourceConflicts } from "./source-conflicts";
import { insurerRequiredFields } from "./insurer-subtypes";
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
const FUTURE_FINANCIAL_DATE_TOLERANCE_DAYS = 1;

function canonicalizeForFingerprint(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalizeForFingerprint);
  if (typeof value === "number" && !Number.isFinite(value)) return `__${String(value)}__`;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, child]) => child !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalizeForFingerprint(child)]),
    );
  }
  return value;
}

export function canonicalInputFingerprint(input: FinancialAnalysisInput): string {
  const payload = canonicalizeForFingerprint({
    input,
    modelVersion: MODEL_VERSION,
    scorePolicyVersion: SCORE_POLICY_VERSION,
    benchmarkVersion: STATIC_BENCHMARK_VERSION,
  });
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

const sectors = new Set<Sector>([
  "technology", "financials", "healthcare", "consumer", "industrials", "energy", "utilities",
  "realEstate", "materials", "communication", "other",
]);

function toSector(value: string | null | undefined): Sector | undefined {
  return value && sectors.has(value as Sector) ? value as Sector : undefined;
}

function entityIdentityConfidence(company: AnalysisInput["company"]): number {
  if (company.cik || company.isin || company.figi || company.lei || company.entityId?.startsWith("sec:")) return 100;
  if (company.issuerId || company.entityId?.startsWith("issuer:")) return 95;
  if (company.securityId && !company.entityId?.startsWith("listing:unknown:")) return 90;
  if (company.entityId?.startsWith("listing:unknown:")) {
    if (company.matchConfidence === "high") return 65;
    if (company.matchConfidence === "medium") return 50;
    return 35;
  }
  if (company.matchType === "exact_canonical_ticker" || company.matchType === "exact_provider_ticker") {
    return company.matchConfidence === "high" ? 80 : company.matchConfidence === "medium" ? 65 : 50;
  }
  return company.entityId ? 75 : 55;
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
    netIncomeCommonStockholders: period.netIncomeCommonStockholders,
    dilutedNetIncomeAvailableToCommon: period.dilutedNetIncomeAvailableToCommon,
    epsDiluted: period.epsDiluted,
    operatingCashFlow: period.operatingCashFlow,
    capitalExpenditures: period.capex,
    totalAssets: period.assets,
    totalLiabilities: period.liabilities,
    cashAndEquivalents: period.cash,
    totalDebt: period.debt,
    totalEquity: period.equity,
    minorityInterest: period.minorityInterest,
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
  const annualPeriods = fundamentals?.annualPeriods ?? fundamentals?.annual.map(mapLegacyPeriod) ?? [];
  const latestAnnualCurrency = [...annualPeriods]
    .sort((left, right) => (left.periodEndDate ?? String(left.fiscalYear ?? "")).localeCompare(right.periodEndDate ?? String(right.fiscalYear ?? "")))
    .reverse()
    .find((period) => period.currency && !period.currencyConflict?.length)?.currency;
  const reportingCurrency = fundamentals?.reportingCurrency
    ?? fundamentals?.trailingTwelveMonths?.currency
    ?? latestAnnualCurrency;
  const tradingCurrency = input.market?.currency ?? undefined;
  return {
    company: {
      ticker: input.company.ticker,
      canonicalTicker: input.company.canonicalTicker,
      entityId: input.company.entityId,
      entityIdentityConfidence: entityIdentityConfidence(input.company),
      cik: input.company.cik,
      name: fundamentals?.name ?? input.company.name,
      sector: toSector(fundamentals?.sector),
      industry: fundamentals?.industry ?? undefined,
      investmentProfile: input.investmentProfile,
      analysisArchetype: fundamentals?.analysisArchetype,
      classificationDiagnostics: fundamentals?.classificationDiagnostics,
      sic: fundamentals?.sic,
      currency: reportingCurrency ?? undefined,
      reportingCurrency: reportingCurrency ?? undefined,
      tradingCurrency,
    },
    annualPeriods,
    trailingTwelveMonths: fundamentals?.trailingTwelveMonths,
    priorTrailingTwelveMonths: fundamentals?.priorTrailingTwelveMonths,
    reportedValuation: fundamentals?.reportedValuation,
    market: input.market ? {
      price: input.market.price,
      currency: input.market.currency || null,
      priceDate: input.market.date,
      volume: input.market.volume,
      yearHigh: input.market.yearHigh,
      yearLow: input.market.yearLow,
      marketCap: input.market.marketCap,
      marketCapAsOf: input.market.marketCapAsOf ?? input.market.date,
      marketCapCurrency: input.market.marketCapCurrency ?? input.market.currency,
      sharesOutstanding: input.market.sharesOutstanding,
      sharesOutstandingAsOf: input.market.sharesOutstandingAsOf ?? input.market.date,
      beta: input.market.beta,
      betaBenchmark: input.market.betaBenchmark,
      betaMethod: input.market.betaMethod,
      betaObservationCount: input.market.betaObservationCount,
      provider: input.market.provider,
      pricePerformance: {
        oneMonth: input.market.performance["1M"] ?? null,
        threeMonth: input.market.performance["3M"] ?? null,
        sixMonth: input.market.performance["6M"] ?? null,
        yearToDate: input.market.performance.YTD ?? null,
        oneYear: input.market.performance["1Y"] ?? null,
      },
    } : undefined,
    analysisDate: input.analysisDate ?? new Date().toISOString(),
    providerDiagnostics: input.providerDiagnostics ?? fundamentals?.diagnostics?.providerDiagnostics,
    specialized: fundamentals?.specialized,
    sourceConflicts: fundamentals?.sourceConflicts ?? [],
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
  archetype: ReturnType<typeof resolveFinancialArchetype>,
  company: FinancialAnalysisInput["company"],
  latest: FinancialPeriod | null,
  specialized?: SpecializedCompanyData,
): MissingDataItem[] {
  const metricValue = (metric: { value?: number | null } | null | undefined) =>
    isFiniteNumber(metric?.value) ? metric.value : null;

  if (archetype === "bank") {
    const bankValues = specialized?.kind === "bank" ? {
      netInterestMargin: metricValue(specialized.netInterestMargin),
      cet1CapitalRatio: metricValue(specialized.cet1CapitalRatio),
      grossLoans: metricValue(specialized.grossLoans),
      deposits: metricValue(specialized.deposits),
      nonperformingLoans: metricValue(specialized.nonPerformingLoans),
      netChargeOffs: metricValue(specialized.netChargeOffs),
      tangibleCommonEquity: metricValue(specialized.tangibleCommonEquity),
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
    const reportedFfo = specialized?.kind === "reit" ? metricValue(specialized.fundsFromOperations) : latest?.fundsFromOperations;
    const reportedAffo = specialized?.kind === "reit" ? metricValue(specialized.adjustedFundsFromOperations) : latest?.adjustedFundsFromOperations;
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
  if (archetype === "insurer") {
    const insurer = specialized?.kind === "insurer" ? specialized : null;
    const labels = new Map([
      ["premiumGrowth", "Premium growth"],
      ["combinedRatio", "Combined ratio"],
      ["lossRatio", "Loss ratio"],
      ["expenseRatio", "Expense ratio"],
      ["bookValue", "Book value"],
      ["tangibleBookValue", "Tangible book value"],
      ["returnOnEquity", "Insurer return on equity"],
      ["regulatoryCapitalRatio", "Regulatory capital ratio"],
      ["reserveDevelopment", "Reserve development"],
    ]);
    return insurerRequiredFields(company).flatMap((field) => isFiniteNumber(
      insurer?.[field as keyof typeof insurer] && typeof insurer[field as keyof typeof insurer] === "object"
        ? (insurer[field as keyof typeof insurer] as { value: number | null }).value
        : null,
    ) ? [] : [{
      field,
      reason: `${labels.get(field) ?? field} is unavailable from the current specialized insurer-data provider phase.`,
      impact: "metric" as const,
      severity: "medium" as const,
    }]);
  }
  return [];
}

function dateIsTooFarInFuture(value: string | null | undefined, analysisDate: string): boolean {
  if (!value) return false;
  const age = (Date.parse(analysisDate) - Date.parse(value)) / 86_400_000;
  return Number.isFinite(age) && age < -FUTURE_FINANCIAL_DATE_TOLERANCE_DAYS;
}

function hasFutureFinancialData(input: FinancialAnalysisInput): boolean {
  const analysisDate = input.analysisDate ?? new Date().toISOString();
  return [
    input.trailingTwelveMonths,
    input.priorTrailingTwelveMonths,
    ...input.annualPeriods,
  ].filter((period): period is FinancialPeriod => Boolean(period)).some((period) =>
    dateIsTooFarInFuture(period.periodEndDate, analysisDate)
    || dateIsTooFarInFuture(period.balanceSheetDate, analysisDate)
  );
}

function normalizedCurrency(value: string | null | undefined): string | null {
  const currency = value?.trim().toUpperCase();
  return currency ? currency : null;
}

function financialCurrencyCodes(input: FinancialAnalysisInput): string[] {
  const currencies = new Set<string>();
  for (const period of [input.trailingTwelveMonths, input.priorTrailingTwelveMonths, ...input.annualPeriods]) {
    if (!period) continue;
    const currency = normalizedCurrency(period.currency ?? input.company.reportingCurrency ?? input.company.currency);
    if (currency) currencies.add(currency);
  }
  return [...currencies].sort();
}

function hasFinancialCurrencyConflict(input: FinancialAnalysisInput): boolean {
  return [
    input.trailingTwelveMonths,
    input.priorTrailingTwelveMonths,
    ...input.annualPeriods,
  ].filter((period): period is FinancialPeriod => Boolean(period)).some((period) =>
    (period.currencyConflict?.length ?? 0) > 1
  );
}

function missingSubjectKey(field: string): string {
  const normalized = field
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\bNIM\b/gi, "net interest margin")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
  const aliases: Record<string, string> = {
    depositsgrossloans: "deposits",
    loanlossprovisionsgrossloans: "loanlossprovisions",
    netchargeoffsgrossloans: "netchargeoffs",
    nonperformingloansgrossloans: "nonperformingloans",
  };
  return aliases[normalized] ?? normalized;
}

function dedupeMissingData(items: MissingDataItem[]): MissingDataItem[] {
  const metricSubjects = new Set(
    items
      .filter((item) => item.impact === "metric")
      .map((item) => missingSubjectKey(item.field)),
  );
  const unique = new Map<string, MissingDataItem>();
  for (const item of items) {
    if (item.impact === "score" && metricSubjects.has(missingSubjectKey(item.field))) continue;
    unique.set(`${item.field}:${item.impact}`, item);
  }
  return [...unique.values()];
}

export function analyzeFinancials(input: FinancialAnalysisInput): FinancialAnalysisResult {
  const effectiveInput: FinancialAnalysisInput = input.analysisDate
    ? input
    : { ...input, analysisDate: new Date().toISOString() };
  const ttmConsistency = ttmPeriodBasisCheck(effectiveInput.trailingTwelveMonths);
  const consistencySafeInput = ttmConsistency.status === "warning"
    ? { ...effectiveInput, trailingTwelveMonths: undefined, priorTrailingTwelveMonths: undefined }
    : effectiveInput;
  const initialFreshness = assessDataFreshness(consistencySafeInput);
  const annualFallbackInput = consistencySafeInput.trailingTwelveMonths
    ? { ...consistencySafeInput, trailingTwelveMonths: undefined, priorTrailingTwelveMonths: undefined }
    : consistencySafeInput;
  const annualFallbackFreshness = assessDataFreshness(annualFallbackInput);
  const periodConsistentInput = consistencySafeInput.trailingTwelveMonths
    && initialFreshness.dataStatus === "stale"
    && annualFallbackFreshness.dataStatus === "current"
    ? annualFallbackInput
    : consistencySafeInput;
  const freshness = periodConsistentInput === annualFallbackInput
    ? annualFallbackFreshness
    : initialFreshness;
  const futureFinancialData = hasFutureFinancialData(periodConsistentInput);
  const financialCurrencies = financialCurrencyCodes(periodConsistentInput);
  const financialCurrencyMismatch = financialCurrencies.length > 1;
  const financialCurrencyConflict = hasFinancialCurrencyConflict(periodConsistentInput);
  const unsafeFinancialCurrencies = financialCurrencyMismatch || financialCurrencyConflict;
  const sourceConflictPolicy = summarizeSourceConflicts(periodConsistentInput);
  const blockingSourceConflict = sourceConflictPolicy.blocking;
  const analysisDataStatus = futureFinancialData || unsafeFinancialCurrencies || blockingSourceConflict ? "unavailable" as const : freshness.dataStatus;
  const unusableFinancialData = freshness.dataStatus === "stale" || futureFinancialData || unsafeFinancialCurrencies || blockingSourceConflict;
  const calculationInput = unusableFinancialData
    ? { ...periodConsistentInput, annualPeriods: [], trailingTwelveMonths: undefined, priorTrailingTwelveMonths: undefined }
    : periodConsistentInput;
  const metrics = computeFinancialMetrics(calculationInput);
  const currencyAlignment = valuationCurrencyAlignment(periodConsistentInput, metrics.latestPeriod);
  const reconciliation = reconcileFinancialData(unusableFinancialData ? calculationInput : periodConsistentInput, metrics);
  if (ttmConsistency.status === "warning") {
    const ttmCheckIndex = reconciliation.findIndex((check) => check.code === ttmConsistency.code);
    if (ttmCheckIndex >= 0) reconciliation[ttmCheckIndex] = ttmConsistency;
    else reconciliation.unshift(ttmConsistency);
  }
  if (unsafeFinancialCurrencies) {
    reconciliation.push({
      code: "financial_currency_consistency",
      status: "warning",
      message: financialCurrencyConflict
        ? "At least one financial period contains conflicting monetary currencies; growth and scoring require one verified reporting currency per period."
        : `Financial periods use mixed reporting currencies (${financialCurrencies.join(", ")}); growth and scoring require restated comparable currency data.`,
    });
  }
  if (blockingSourceConflict) {
    if (!reconciliation.some((check) => check.code === "provider_source_conflict")) {
      reconciliation.push({
        code: "provider_source_conflict",
        status: "warning",
        message: "Primary and secondary fundamentals providers disagree materially on one or more same-period facts.",
      });
    }
  }
  reconciliation.push({
    code: "fundamental_data_freshness",
    status: futureFinancialData || freshness.dataStatus === "stale"
      ? "warning"
      : freshness.dataStatus === "current" ? "pass" : "unavailable",
    message: futureFinancialData
      ? "Latest reliable financial statements are future-dated relative to the analysis date."
      : freshness.dataStatus === "stale"
      ? "Latest reliable financial statements are too old for a current analysis."
      : freshness.dataStatus === "current"
        ? "Financial statements are within the current-analysis freshness threshold."
        : "Financial statement freshness could not be established.",
  });
  const dcf = computeDcfRange(calculationInput, metrics);
  const computedScores = computeScores(calculationInput, metrics, {
    reconciliation: reconciliationConfidence(reconciliation),
    valuationAssumptionQuality: dcf.assumptionQuality,
    valuationStatus: dcf.status,
  });
  const scores = unusableFinancialData
    ? { ...computedScores, stockBoxScore: null, personalizedScore: null, shortTermScore: null, longTermScore: null }
    : computedScores;
  const archetype = resolveFinancialArchetype(calculationInput);
  const redFlags = detectFinancialRedFlags(metrics, archetype, calculationInput.specialized, calculationInput.company);
  const recommendation = deriveRecommendation(scores, redFlags, dcf);
  const scenarioStatus = unusableFinancialData ? "insufficient_data" : scenarioStatusFor(metrics, scores, dcf);
  const scenarios = unusableFinancialData ? [] : buildAnalysisScenarios(metrics, scores, dcf);
  const unsuitableCorporateFields = new Set(
    ["bank", "insurer", "reit"].includes(archetype)
      ? ["simpleFreeCashFlow", "enterpriseValue", "normalizedTaxRate"]
      : [],
  );
  const missing = [
    ...specializedMissingData(archetype, calculationInput.company, metrics.latestPeriod, calculationInput.specialized),
    ...metrics.missingData.filter((item) => !unsuitableCorporateFields.has(item.field)),
    ...scores.missingData.filter((item) => !unsuitableCorporateFields.has(item.field)),
    ...dcf.missingData,
  ];
  if (futureFinancialData) {
    missing.push({
      field: "futureFinancialData",
      reason: "Latest reliable financial statements are future-dated relative to the analysis date.",
      impact: "score",
      severity: "high",
    });
  }
  if (unsafeFinancialCurrencies) {
    missing.push({
      field: "financialCurrencyConsistency",
      reason: financialCurrencyConflict
        ? "At least one financial period contains conflicting monetary currencies."
        : `Financial periods use mixed reporting currencies (${financialCurrencies.join(", ")}); growth and scoring require restated comparable currency data.`,
      impact: "score",
      severity: "high",
    });
  }
  if (blockingSourceConflict) {
    missing.push({
      field: "sourceConflict",
      reason: "A material same-period provider conflict must be resolved before scoring or rating.",
      impact: "score",
      severity: "high",
    });
  } else if (sourceConflictPolicy.hasConflicts) {
    missing.push({
      field: "sourceConflict",
      reason: "A historical provider disagreement remains visible and reduces confidence without discarding current primary facts.",
      impact: "score",
      severity: "medium",
    });
  }
  if (freshness.dataStatus === "stale") {
    missing.push({
      field: "staleFinancialData",
      reason: "Latest reliable financial statements are too old for a current analysis.",
      impact: "score",
      severity: "high",
    });
  }
  for (const check of reconciliation.filter((item) => item.status === "warning")) {
    const severity = check.code === "provider_source_conflict" && !blockingSourceConflict ? "medium" as const : "high" as const;
    missing.push({ field: check.code, reason: check.message, impact: "score", severity });
  }
  const uniqueMissing = dedupeMissingData(missing);
  return {
    modelVersion: MODEL_VERSION,
    canonicalInputFingerprint: canonicalInputFingerprint(effectiveInput),
    reportSchemaVersion: REPORT_SCHEMA_VERSION,
    analysisArchetype: archetype,
    classificationDiagnostics: calculationInput.company.classificationDiagnostics,
    currencyAlignment,
    dataStatus: analysisDataStatus,
    metrics,
    scores,
    redFlags,
    recommendation,
    dcf,
    scenarios,
    scenarioStatus,
    missingData: uniqueMissing,
    dataCoverage: scores.dataCoverage,
    confidenceBreakdown: scores.confidenceBreakdown,
    diagnostics: {
      ...diagnosticDates(periodConsistentInput, { ...freshness, dataStatus: analysisDataStatus }),
      currencyAlignment,
    },
    reconciliation,
    provenance: metrics.provenance,
    sourceConflicts: periodConsistentInput.sourceConflicts ?? [],
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
    greenFlags: detectArchetypeGreenFlags(metrics, result.metrics, result.analysisArchetype, canonicalInput.specialized, canonicalInput.company),
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
    reportingCurrency: canonicalInput.company.reportingCurrency ?? canonicalInput.company.currency ?? null,
    dataAsOf: result.diagnostics.latestFinancialPeriodEnd,
    dataStatus: result.dataStatus,
    confidenceBreakdown: result.confidenceBreakdown,
    providerDiagnostics: result.diagnostics.providerDiagnostics,
    scenarioStatus: result.scenarioStatus,
    engine: result,
  };
  return report;
}

/** Compatibility entry point. All calculations route through analyzeFinancials. */
export function buildAnalysis(input: AnalysisInput): AnalysisReport {
  const canonicalInput = toFinancialAnalysisInput(input);
  const result = analyzeFinancials(canonicalInput);
  const report = presentAnalysisReport(input, canonicalInput, result);
  attachInstitutionalResearch(report, result, canonicalInput, { market: input.market });
  return report;
}
