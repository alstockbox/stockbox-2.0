import {
  MODEL_VERSION,
  SCORE_COVERAGE_POLICY,
  SCORE_POLICY_VERSION,
  STATIC_BENCHMARK_VERSION,
  benchmarksForSector,
  longTermWeights,
  shortTermWeights,
  weightsForSector,
  weightsForSectorAndProfile,
} from "./config";
import { resolveFinancialArchetype } from "./archetypes";
import {
  clamp,
  isFiniteNumber,
  scoreHigherIsBetter,
  scoreLowerIsBetter,
  scoreTargetRange,
} from "./math";
import type {
  AnalysisArchetype,
  ConfidenceBreakdown,
  FinancialAnalysisInput,
  FinancialMetrics,
  ScoreContributor,
  ScoreDimension,
  ScoreDimensionKey,
  ScoreResult,
  SpecializedCompanyData,
  SpecializedCoverage,
  ValuationAssumptionQuality,
} from "./types";
import { valuationCurrencyAlignment } from "./metrics";
import { summarizeSourceConflicts } from "./source-conflicts";
import { insurerRequiredFields, isPropertyCasualtyInsurer, resolveInsurerSubtype } from "./insurer-subtypes";

const dimensionLabels: Record<ScoreDimensionKey, string> = {
  growth: "Growth",
  profitability: "Profitability",
  financialHealth: "Financial Health",
  valuation: "Valuation",
  cashFlow: "Cash Flow",
  earningsQuality: "Earnings Quality",
  quality: "Business Quality",
  momentum: "Momentum",
  risk: "Risk Resilience",
};

type ContributorInput = {
  label: string;
  value: number | null;
  score: number | null;
  weight: number;
  source?: string;
  period?: string;
  unsuitable?: boolean;
};

function contributor(input: ContributorInput): ScoreContributor {
  const availability = input.unsuitable ? "unsuitable" : isFiniteNumber(input.value) && isFiniteNumber(input.score) ? "available" : "missing";
  const score = availability === "available" ? input.score : null;
  return {
    label: input.label,
    value: input.value,
    score,
    weight: input.weight,
    availability,
    source: input.source ?? "canonical financial metrics",
    period: input.period,
    impact: !isFiniteNumber(score) ? "neutral" : score >= 60 ? "positive" : score <= 40 ? "negative" : "neutral",
  };
}
function dimension(key: ScoreDimensionKey, contributors: ScoreContributor[], rationale: string): ScoreDimension {
  const applicable = contributors.filter((item) => item.availability !== "unsuitable");
  const plannedWeight = applicable.reduce((sum, item) => sum + item.weight, 0);
  const available = applicable.filter((item) => item.availability === "available" && isFiniteNumber(item.score));
  const availableWeight = available.reduce((sum, item) => sum + item.weight, 0);
  const coverage = plannedWeight > 0 ? availableWeight / plannedWeight : 0;
  const rawScore = availableWeight > 0
    ? available.reduce((sum, item) => sum + (item.score as number) * item.weight, 0) / availableWeight
    : null;
  const adjustedScore = rawScore === null || coverage < SCORE_COVERAGE_POLICY.dimensionMinimum
    ? null
    : coverage < SCORE_COVERAGE_POLICY.dimensionFull
      ? 50 + (rawScore - 50) * coverage
      : rawScore;
  return {
    key,
    label: dimensionLabels[key],
    score: adjustedScore,
    rawScore,
    adjustedScore,
    coverage,
    plannedWeight,
    availableWeight,
    weight: 0,
    rationale,
    contributors,
    missingData: contributors
      .filter((item) => item.availability !== "available")
      .map((item) => ({
        field: item.label,
        reason: item.availability === "unsuitable" ? "Metric is unsuitable for this company archetype." : "Required source data is unavailable.",
        impact: "score" as const,
        severity: "medium" as const,
      })),
  };
}

const specializedRequiredFields: Partial<Record<AnalysisArchetype, string[]>> = {
  bank: [
    "netInterestIncome", "netInterestMargin", "grossLoans", "deposits", "depositGrowth",
    "fundingCost", "cet1CapitalRatio", "tangibleCommonEquity", "tangibleBookValuePerShare",
    "nonPerformingLoans", "netChargeOffs", "loanLossProvisions", "efficiencyRatio",
    "returnOnAssets", "returnOnEquity", "returnOnTangibleCommonEquity",
  ],
  reit: [
    "fundsFromOperations", "fundsFromOperationsPerShare", "adjustedFundsFromOperations",
    "adjustedFundsFromOperationsPerShare", "fundsFromOperationsGrowth",
    "adjustedFundsFromOperationsGrowth", "adjustedFundsFromOperationsPayout",
    "dividendCoverage", "occupancy", "sameStoreNoiGrowth", "netDebtToEbitdare",
    "debtMaturities", "fixedChargeCoverage", "netAssetValue",
  ],
};

function specializedRequiredFieldsFor(
  archetype: AnalysisArchetype,
  company: FinancialAnalysisInput["company"],
): string[] | undefined {
  if (archetype === "insurer") {
    return insurerRequiredFields(company);
  }
  return specializedRequiredFields[archetype];
}

function specializedCoverageFor(
  archetype: AnalysisArchetype,
  company: FinancialAnalysisInput["company"],
  specialized?: SpecializedCompanyData,
): SpecializedCoverage | undefined {
  const required = specializedRequiredFieldsFor(archetype, company);
  if (!required) return undefined;
  const values = specialized?.kind === archetype
    ? specialized as unknown as Record<string, { value?: number | null }>
    : {};
  const available = required.filter((field) => isFiniteNumber(values[field]?.value));
  return {
    overall: required.length ? available.length / required.length : 0,
    required,
    available,
    missing: required.filter((field) => !available.includes(field)),
    ...(archetype === "insurer" ? { insurerSubtype: resolveInsurerSubtype(company) } : {}),
  };
}

function standardDimensions(input: FinancialAnalysisInput, metrics: FinancialMetrics): Record<ScoreDimensionKey, ScoreDimension> {
  const b = benchmarksForSector(input.company.sector);
  const m = metrics;
  const latestPeriod = m.latestPeriod?.periodEndDate;
  const c = (label: string, value: number | null, score: number | null, weight: number) =>
    contributor({ label, value, score, weight, period: latestPeriod });
  const revenueGrowthLabel = m.growth.revenueGrowthBasis === "TTM_YOY" ? "Revenue growth TTM YoY" : "Revenue growth annual YoY";
  const fcfGrowthLabel = m.growth.freeCashFlowGrowthBasis === "TTM_YOY" ? "FCF growth TTM YoY" : "FCF growth annual YoY";
  return {
    growth: dimension("growth", [
      c(revenueGrowthLabel, m.growth.revenueGrowthYoY, scoreHigherIsBetter(m.growth.revenueGrowthYoY, b.revenueGrowthWeak, b.revenueGrowthStrong), 0.3),
      c("Revenue CAGR 3Y", m.growth.revenueCagr3y, scoreHigherIsBetter(m.growth.revenueCagr3y, 0, b.revenueGrowthStrong), 0.3),
      c("EPS CAGR 3Y", m.growth.epsCagr3y, scoreHigherIsBetter(m.growth.epsCagr3y, -0.03, 0.18), 0.2),
      c("FCF/share CAGR 3Y", m.growth.freeCashFlowPerShareCagr3y, scoreHigherIsBetter(m.growth.freeCashFlowPerShareCagr3y, -0.03, 0.15), 0.2),
    ], "Growth requires both breadth and durability; one isolated metric cannot carry the dimension."),
    profitability: dimension("profitability", [
      c("Gross margin", m.margins.grossMargin, scoreHigherIsBetter(m.margins.grossMargin, b.grossMarginWeak, b.grossMarginStrong), 0.2),
      c("Operating margin", m.margins.operatingMargin, scoreHigherIsBetter(m.margins.operatingMargin, b.operatingMarginWeak, b.operatingMarginStrong), 0.3),
      c("Net margin", m.margins.netMargin, scoreHigherIsBetter(m.margins.netMargin, b.netMarginWeak, b.netMarginStrong), 0.2),
      c("ROIC", m.ratios.returnOnInvestedCapital, scoreHigherIsBetter(m.ratios.returnOnInvestedCapital, b.roicWeak, b.roicStrong), 0.3),
    ], "Margins and average-capital returns measure operating economics."),
    financialHealth: dimension("financialHealth", [
      c("Net debt / EBITDA", m.ratios.netDebtToEbitda, scoreLowerIsBetter(m.ratios.netDebtToEbitda, b.netDebtToEbitdaWeak, b.netDebtToEbitdaStrong), 0.35),
      c("Interest coverage", m.ratios.interestCoverage, scoreHigherIsBetter(m.ratios.interestCoverage, b.interestCoverageWeak, b.interestCoverageStrong), 0.3),
      c("Cash / debt", m.ratios.cashToDebt, scoreHigherIsBetter(m.ratios.cashToDebt, 0.1, 1), 0.2),
      c("Current ratio", m.ratios.currentRatio, scoreTargetRange(m.ratios.currentRatio, 0.5, 1.2, 3, 6), 0.15),
    ], "Only reported balance-sheet values are used; missing debt or cash is never treated as zero."),
    valuation: dimension("valuation", [
      c("P/E", m.valuation.priceEarnings, scoreLowerIsBetter(m.valuation.priceEarnings, b.peExpensive, b.peAttractive), 0.25),
      c("EV / EBITDA", m.valuation.evEbitda, scoreLowerIsBetter(m.valuation.evEbitda, b.evEbitdaExpensive, b.evEbitdaAttractive), 0.25),
      c("EV / Sales", m.valuation.evSales, scoreLowerIsBetter(m.valuation.evSales, b.evSalesExpensive, b.evSalesAttractive), 0.15),
      c("FCF yield", m.valuation.freeCashFlowYield, scoreHigherIsBetter(m.valuation.freeCashFlowYield, b.fcfYieldWeak, b.fcfYieldStrong), 0.35),
    ], `Valuation uses ${STATIC_BENCHMARK_VERSION}; live peers are not implied.`),
    cashFlow: dimension("cashFlow", [
      c("Simple FCF margin", m.margins.freeCashFlowMargin, scoreHigherIsBetter(m.margins.freeCashFlowMargin, -0.02, 0.18), 0.3),
      c("CFO margin", m.margins.operatingCashFlowMargin, scoreHigherIsBetter(m.margins.operatingCashFlowMargin, 0, 0.2), 0.25),
      c(fcfGrowthLabel, m.growth.freeCashFlowGrowthYoY, scoreHigherIsBetter(m.growth.freeCashFlowGrowthYoY, -0.15, 0.2), 0.2),
      c("FCF / net income", m.cashFlow.freeCashFlowToNetIncome, scoreTargetRange(m.cashFlow.freeCashFlowToNetIncome, 0, 0.8, 1.4, 2.5), 0.25),
    ], "Cash generation, growth and accounting conversion are scored separately."),
    earningsQuality: dimension("earningsQuality", [
      c("CFO / net income", m.cashFlow.cfoToNetIncome, scoreTargetRange(m.cashFlow.cfoToNetIncome, 0, 0.85, 1.5, 3), 0.35),
      c("Accrual ratio", m.cashFlow.accrualRatio, scoreLowerIsBetter(m.cashFlow.accrualRatio, 0.15, -0.05), 0.25),
      c("Operating margin stability", m.cashFlow.operatingMarginStability, scoreHigherIsBetter(m.cashFlow.operatingMarginStability, 0.3, 0.9), 0.2),
      c("FCF stability", m.cashFlow.freeCashFlowStability, scoreHigherIsBetter(m.cashFlow.freeCashFlowStability, 0.2, 0.85), 0.2),
    ], "Cash support, accruals and multi-period stability determine accounting quality."),
    quality: dimension("quality", [
      c("ROIC", m.ratios.returnOnInvestedCapital, scoreHigherIsBetter(m.ratios.returnOnInvestedCapital, b.roicWeak, b.roicStrong), 0.35),
      c("ROA", m.ratios.returnOnAssets, scoreHigherIsBetter(m.ratios.returnOnAssets, b.roaWeak, b.roaStrong), 0.2),
      c("Gross margin stability", m.cashFlow.grossMarginStability, scoreHigherIsBetter(m.cashFlow.grossMarginStability, 0.3, 0.9), 0.2),
      c("Share dilution", m.trends.sharesDilutionYoY, scoreLowerIsBetter(m.trends.sharesDilutionYoY, 0.08, -0.02), 0.25),
    ], "Capital efficiency, durability and per-share discipline form the quality composite."),
    momentum: dimension("momentum", [
      c("Price performance 3M", input.market?.pricePerformance?.threeMonth ?? null, scoreHigherIsBetter(input.market?.pricePerformance?.threeMonth ?? null, -0.2, 0.25), 0.4),
      c("Price performance 1Y", input.market?.pricePerformance?.oneYear ?? null, scoreHigherIsBetter(input.market?.pricePerformance?.oneYear ?? null, -0.35, 0.45), 0.6),
    ], "Price momentum is a limited context signal and never changes the underlying facts."),
    risk: dimension("risk", [
      c("Beta", input.market?.beta ?? null, scoreLowerIsBetter(input.market?.beta ?? null, b.betaHighRisk, b.betaLowRisk), 0.35),
      c("Interest coverage", m.ratios.interestCoverage, scoreHigherIsBetter(m.ratios.interestCoverage, 1.5, 8), 0.35),
      c("Equity / assets", m.ratios.equityToAssets, scoreHigherIsBetter(m.ratios.equityToAssets, 0.1, 0.55), 0.3),
    ], "Market sensitivity and balance-sheet resilience provide a bounded risk context."),
  };
}

function archetypeDimensions(
  input: FinancialAnalysisInput,
  metrics: FinancialMetrics,
  archetype: AnalysisArchetype,
): Record<ScoreDimensionKey, ScoreDimension> {
  const dimensions = standardDimensions(input, metrics);
  const latest = metrics.latestPeriod;
  const period = latest?.periodEndDate;
  const c = (label: string, value: number | null, score: number | null, weight: number, unsuitable = false) =>
    contributor({ label, value, score, weight, period, unsuitable });

  if (archetype === "bank") {
    const bank = input.specialized?.kind === "bank" ? input.specialized : null;
    const netInterestMargin = bank?.netInterestMargin.value ?? null;
    const bankRoa = bank?.returnOnAssets.value ?? null;
    const bankRoe = bank?.returnOnEquity.value ?? null;
    const efficiencyRatio = bank?.efficiencyRatio.value ?? null;
    const cet1 = bank?.cet1CapitalRatio.value ?? null;
    const grossLoans = bank?.grossLoans.value ?? null;
    const deposits = bank?.deposits.value ?? null;
    const nonPerformingLoanRatio = isFiniteNumber(bank?.nonPerformingLoans.value) && isFiniteNumber(grossLoans) && grossLoans !== 0
      ? bank.nonPerformingLoans.value / grossLoans
      : null;
    const netChargeOffRatio = isFiniteNumber(bank?.netChargeOffs.value) && isFiniteNumber(grossLoans) && grossLoans !== 0
      ? bank.netChargeOffs.value / grossLoans
      : null;
    const depositFundingRatio = isFiniteNumber(deposits) && isFiniteNumber(grossLoans) && grossLoans !== 0
      ? deposits / grossLoans
      : null;
    const priceTangibleBook = isFiniteNumber(input.market?.price) && isFiniteNumber(bank?.tangibleBookValuePerShare.value)
      && bank.tangibleBookValuePerShare.value > 0
      ? input.market.price / bank.tangibleBookValuePerShare.value
      : isFiniteNumber(metrics.valuation.marketCap) && isFiniteNumber(bank?.tangibleCommonEquity.value)
        && bank.tangibleCommonEquity.value > 0
        ? metrics.valuation.marketCap / bank.tangibleCommonEquity.value
        : null;
    dimensions.profitability = dimension("profitability", [
      c("Net interest margin", netInterestMargin, scoreHigherIsBetter(netInterestMargin, 0.015, 0.04), 0.3),
      c("Return on assets", bankRoa, scoreHigherIsBetter(bankRoa, 0.003, 0.018), 0.25),
      c("Return on equity", bankRoe, scoreHigherIsBetter(bankRoe, 0.05, 0.18), 0.25),
      c("Efficiency ratio", efficiencyRatio, scoreLowerIsBetter(efficiencyRatio, 0.75, 0.45), 0.2),
    ], "Reported banking margins, returns and operating efficiency determine profitability coverage.");
    dimensions.financialHealth = dimension("financialHealth", [
      c("CET1 capital ratio", cet1, scoreHigherIsBetter(cet1, 0.07, 0.15), 0.35),
      c("Nonperforming loans / gross loans", nonPerformingLoanRatio, scoreLowerIsBetter(nonPerformingLoanRatio, 0.05, 0.01), 0.2),
      c("Net charge-offs / gross loans", netChargeOffRatio, scoreLowerIsBetter(netChargeOffRatio, 0.025, 0.003), 0.15),
      c("Deposits / gross loans", depositFundingRatio, scoreHigherIsBetter(depositFundingRatio, 0.65, 1.1), 0.15),
      c("Equity / assets", metrics.ratios.equityToAssets, scoreHigherIsBetter(metrics.ratios.equityToAssets, 0.04, 0.12), 0.15),
    ], "Regulatory capital, asset quality and deposit funding are required; corporate current ratios are not substituted.");
    dimensions.cashFlow = dimension("cashFlow", [c("Corporate FCF", null, null, 1, true)], "Corporate free cash flow is not a valid primary measure for this archetype.");
    dimensions.valuation = dimension("valuation", [
      c("P / Tangible Book", priceTangibleBook, scoreLowerIsBetter(priceTangibleBook, 3, 0.8), 0.4),
      c("P / Book", metrics.valuation.priceBook, scoreLowerIsBetter(metrics.valuation.priceBook, 3, 0.8), 0.3),
      c("P / E", metrics.valuation.priceEarnings, scoreLowerIsBetter(metrics.valuation.priceEarnings, 24, 9), 0.3),
    ], "Equity-oriented bank multiples require reported tangible book inputs.");
    const provisionRatio = isFiniteNumber(bank?.loanLossProvisions.value) && isFiniteNumber(grossLoans) && grossLoans !== 0
      ? bank.loanLossProvisions.value / grossLoans
      : null;
    dimensions.growth = dimension("growth", [
      c("Deposit growth", bank?.depositGrowth.value ?? null, scoreHigherIsBetter(bank?.depositGrowth.value ?? null, -0.05, 0.12), 0.4),
      c("Net interest income growth", null, null, 0.3),
      c("Gross loan growth", null, null, 0.3),
    ], "Bank growth requires deposit, loan and net-interest-income growth; unavailable specialist growth is not replaced by corporate FCF or EPS growth.");
    dimensions.earningsQuality = dimension("earningsQuality", [
      c("Nonperforming loans / gross loans", nonPerformingLoanRatio, scoreLowerIsBetter(nonPerformingLoanRatio, 0.05, 0.01), 0.45),
      c("Net charge-offs / gross loans", netChargeOffRatio, scoreLowerIsBetter(netChargeOffRatio, 0.025, 0.003), 0.35),
      c("Loan-loss provisions / gross loans", provisionRatio, scoreTargetRange(provisionRatio, 0, 0.004, 0.025, 0.06), 0.2),
    ], "Bank earnings quality is evaluated through reported asset-quality and credit-loss metrics, not corporate accrual ratios.");
    dimensions.quality = dimension("quality", [
      c("Return on tangible common equity", bank?.returnOnTangibleCommonEquity.value ?? null, scoreHigherIsBetter(bank?.returnOnTangibleCommonEquity.value ?? null, 0.06, 0.2), 0.45),
      c("Efficiency ratio", efficiencyRatio, scoreLowerIsBetter(efficiencyRatio, 0.75, 0.45), 0.3),
      c("Deposits / gross loans", depositFundingRatio, scoreHigherIsBetter(depositFundingRatio, 0.65, 1.1), 0.25),
    ], "Bank quality uses tangible-equity returns, operating efficiency and deposit funding rather than industrial ROIC.");
    dimensions.risk = dimension("risk", [
      c("CET1 capital ratio", cet1, scoreHigherIsBetter(cet1, 0.07, 0.15), 0.35),
      c("Nonperforming loans / gross loans", nonPerformingLoanRatio, scoreLowerIsBetter(nonPerformingLoanRatio, 0.05, 0.01), 0.25),
      c("Deposits / gross loans", depositFundingRatio, scoreHigherIsBetter(depositFundingRatio, 0.65, 1.1), 0.2),
      c("Beta", input.market?.beta ?? null, scoreLowerIsBetter(input.market?.beta ?? null, 1.6, 0.7), 0.2),
    ], "Bank risk uses regulatory capital, asset quality, funding resilience and bounded market sensitivity.");
  }

  if (archetype === "insurer") {
    const insurer = input.specialized?.kind === "insurer" ? input.specialized : null;
    const propertyCasualty = isPropertyCasualtyInsurer(input.company);
    const combinedRatio = insurer?.combinedRatio.value ?? null;
    const lossRatio = insurer?.lossRatio.value ?? null;
    const expenseRatio = insurer?.expenseRatio.value ?? null;
    const insurerRoe = insurer?.returnOnEquity.value ?? null;
    const regulatoryCapital = insurer?.regulatoryCapitalRatio.value ?? null;
    const reserveDevelopment = insurer?.reserveDevelopment.value ?? null;
    const priceBook = isFiniteNumber(metrics.valuation.marketCap) && isFiniteNumber(insurer?.bookValue.value)
      && insurer.bookValue.value > 0
      ? metrics.valuation.marketCap / insurer.bookValue.value
      : metrics.valuation.priceBook;
    const priceTangibleBook = isFiniteNumber(metrics.valuation.marketCap) && isFiniteNumber(insurer?.tangibleBookValue.value)
      && insurer.tangibleBookValue.value > 0
      ? metrics.valuation.marketCap / insurer.tangibleBookValue.value
      : null;
    dimensions.growth = dimension("growth", [
      c("Premium growth", insurer?.premiumGrowth.value ?? null, scoreHigherIsBetter(insurer?.premiumGrowth.value ?? null, -0.03, 0.12), 1),
    ], "Reported premium growth replaces generic industrial revenue-growth assumptions.");
    dimensions.profitability = propertyCasualty
      ? dimension("profitability", [
        c("Combined ratio", combinedRatio, scoreLowerIsBetter(combinedRatio, 1.05, 0.88), 0.3),
        c("Loss ratio", lossRatio, scoreLowerIsBetter(lossRatio, 0.78, 0.55), 0.25),
        c("Expense ratio", expenseRatio, scoreLowerIsBetter(expenseRatio, 0.42, 0.25), 0.2),
        c("Return on equity", insurerRoe, scoreHigherIsBetter(insurerRoe, 0.05, 0.18), 0.25),
      ], "Underwriting ratios and reported insurer return on equity determine profitability.")
      : dimension("profitability", [
        c("Premium growth", insurer?.premiumGrowth.value ?? null, scoreHigherIsBetter(insurer?.premiumGrowth.value ?? null, -0.03, 0.12), 0.4),
        c("Return on equity", insurerRoe, scoreHigherIsBetter(insurerRoe, 0.05, 0.18), 0.6),
      ], "Premium growth and reported insurer return on equity determine profitability when P&C underwriting ratios are not comparable.");
    dimensions.financialHealth = propertyCasualty
      ? dimension("financialHealth", [
        c("Regulatory capital ratio", regulatoryCapital, scoreHigherIsBetter(regulatoryCapital, 1, 2), 0.6),
        c("Reserve development", reserveDevelopment, scoreLowerIsBetter(reserveDevelopment, 0.08, -0.02), 0.4),
      ], "Regulatory capital and reserve development replace corporate leverage ratios for insurers.")
      : dimension("financialHealth", [
        c("Regulatory capital ratio", regulatoryCapital, scoreHigherIsBetter(regulatoryCapital, 1, 2), 1),
      ], "Reported regulatory capital replaces corporate leverage ratios for insurers.");
    dimensions.cashFlow = dimension("cashFlow", [c("Corporate FCF", null, null, 1, true)], "Corporate free cash flow is not a valid primary measure for this archetype.");
    dimensions.valuation = dimension("valuation", [
      c("P / Tangible Book", priceTangibleBook, scoreLowerIsBetter(priceTangibleBook, 3, 0.8), 0.4),
      c("P / Book", priceBook, scoreLowerIsBetter(priceBook, 3, 0.8), 0.3),
      c("P / E", metrics.valuation.priceEarnings, scoreLowerIsBetter(metrics.valuation.priceEarnings, 24, 9), 0.3),
    ], "Insurer valuation uses reported book, tangible book and earnings multiples.");
    dimensions.earningsQuality = propertyCasualty
      ? dimension("earningsQuality", [
        c("Reserve development", reserveDevelopment, scoreLowerIsBetter(reserveDevelopment, 0.08, -0.02), 0.5),
        c("Combined ratio", combinedRatio, scoreLowerIsBetter(combinedRatio, 1.05, 0.88), 0.5),
      ], "P&C earnings quality uses reserve development and underwriting performance rather than corporate accrual ratios.")
      : dimension("earningsQuality", [
        c("Specialized insurance earnings quality", null, null, 1),
      ], "Life, reinsurance and other non-P&C earnings quality requires specialist reserve or policy data that is not substituted with corporate accrual metrics.");
    dimensions.quality = dimension("quality", [
      c("Return on equity", insurerRoe, scoreHigherIsBetter(insurerRoe, 0.05, 0.18), 0.6),
      c("Regulatory capital ratio", regulatoryCapital, scoreHigherIsBetter(regulatoryCapital, 1, 2), 0.4),
    ], "Insurer quality uses reported equity returns and regulatory capital rather than industrial ROIC.");
    dimensions.risk = propertyCasualty
      ? dimension("risk", [
        c("Regulatory capital ratio", regulatoryCapital, scoreHigherIsBetter(regulatoryCapital, 1, 2), 0.5),
        c("Reserve development", reserveDevelopment, scoreLowerIsBetter(reserveDevelopment, 0.08, -0.02), 0.3),
        c("Beta", input.market?.beta ?? null, scoreLowerIsBetter(input.market?.beta ?? null, 1.6, 0.7), 0.2),
      ], "P&C risk uses regulatory capital, reserve development and bounded market sensitivity.")
      : dimension("risk", [
        c("Regulatory capital ratio", regulatoryCapital, scoreHigherIsBetter(regulatoryCapital, 1, 2), 0.7),
        c("Beta", input.market?.beta ?? null, scoreLowerIsBetter(input.market?.beta ?? null, 1.6, 0.7), 0.3),
      ], "Non-P&C insurer risk uses regulatory capital and bounded market sensitivity; industrial leverage ratios are not substituted.");
  }

  if (archetype === "reit") {
    const reit = input.specialized?.kind === "reit" ? input.specialized : null;
    const ffo = reit?.fundsFromOperations.value ?? latest?.fundsFromOperations ?? null;
    const affo = reit?.adjustedFundsFromOperations.value ?? latest?.adjustedFundsFromOperations ?? null;
    const ffoMargin = isFiniteNumber(ffo) && isFiniteNumber(latest?.revenue) && latest.revenue !== 0
      ? ffo / latest.revenue
      : null;
    const ffoYield = isFiniteNumber(ffo) && isFiniteNumber(metrics.valuation.marketCap)
      ? ffo / metrics.valuation.marketCap
      : null;
    dimensions.growth = dimension("growth", [
      c("FFO growth", reit?.fundsFromOperationsGrowth.value ?? null, scoreHigherIsBetter(reit?.fundsFromOperationsGrowth.value ?? null, -0.08, 0.1), 0.5),
      c("AFFO growth", reit?.adjustedFundsFromOperationsGrowth.value ?? null, scoreHigherIsBetter(reit?.adjustedFundsFromOperationsGrowth.value ?? null, -0.08, 0.1), 0.5),
    ], "Reported FFO and AFFO growth replace GAAP EPS growth for REITs.");
    dimensions.profitability = dimension("profitability", [
      c("FFO margin", ffoMargin, scoreHigherIsBetter(ffoMargin, 0.15, 0.55), 0.4),
      c("Occupancy", reit?.occupancy.value ?? null, scoreHigherIsBetter(reit?.occupancy.value ?? null, 0.8, 0.97), 0.3),
      c("Same-store NOI growth", reit?.sameStoreNoiGrowth.value ?? null, scoreHigherIsBetter(reit?.sameStoreNoiGrowth.value ?? null, -0.03, 0.06), 0.3),
    ], "REIT profitability requires reported FFO and property operating metrics rather than GAAP EPS.");
    dimensions.valuation = dimension("valuation", [c("FFO yield", ffoYield, scoreHigherIsBetter(ffoYield, 0.025, 0.08), 1)], "P/FFO is used only when provider-reported FFO exists; P/E does not dominate.");
    dimensions.financialHealth = dimension("financialHealth", [
      c("Net debt / EBITDAre", reit?.netDebtToEbitdare.value ?? null, scoreLowerIsBetter(reit?.netDebtToEbitdare.value ?? null, 8, 4), 0.5),
      c("Fixed-charge coverage", reit?.fixedChargeCoverage.value ?? null, scoreHigherIsBetter(reit?.fixedChargeCoverage.value ?? null, 1.2, 3), 0.5),
    ], "REIT leverage and fixed-charge coverage replace generic industrial leverage ratios.");
    dimensions.cashFlow = dimension("cashFlow", [
      c("FFO margin", ffoMargin, scoreHigherIsBetter(ffoMargin, 0.15, 0.55), 0.25),
      c("AFFO payout", reit?.adjustedFundsFromOperationsPayout.value ?? null, scoreTargetRange(reit?.adjustedFundsFromOperationsPayout.value ?? null, 0, 0.25, 0.8, 1.2), 0.3),
      c("Dividend coverage", reit?.dividendCoverage.value ?? null, scoreHigherIsBetter(reit?.dividendCoverage.value ?? null, 0.8, 1.5), 0.25),
      c("AFFO growth", reit?.adjustedFundsFromOperationsGrowth.value ?? null, scoreHigherIsBetter(reit?.adjustedFundsFromOperationsGrowth.value ?? null, -0.08, 0.1), 0.2),
    ], "REIT cash generation uses reported FFO/AFFO economics rather than corporate free-cash-flow conversion.");
    dimensions.earningsQuality = dimension("earningsQuality", [
      c("AFFO payout", reit?.adjustedFundsFromOperationsPayout.value ?? null, scoreTargetRange(reit?.adjustedFundsFromOperationsPayout.value ?? null, 0, 0.25, 0.8, 1.2), 0.4),
      c("Dividend coverage", reit?.dividendCoverage.value ?? null, scoreHigherIsBetter(reit?.dividendCoverage.value ?? null, 0.8, 1.5), 0.3),
      c("AFFO", affo, isFiniteNumber(affo) && affo > 0 ? 70 : isFiniteNumber(affo) ? 20 : null, 0.3),
    ], "Reported AFFO, payout and dividend coverage determine REIT earnings quality.");
    dimensions.quality = dimension("quality", [
      c("Occupancy", reit?.occupancy.value ?? null, scoreHigherIsBetter(reit?.occupancy.value ?? null, 0.8, 0.97), 0.4),
      c("Same-store NOI growth", reit?.sameStoreNoiGrowth.value ?? null, scoreHigherIsBetter(reit?.sameStoreNoiGrowth.value ?? null, -0.03, 0.06), 0.3),
      c("AFFO growth", reit?.adjustedFundsFromOperationsGrowth.value ?? null, scoreHigherIsBetter(reit?.adjustedFundsFromOperationsGrowth.value ?? null, -0.08, 0.1), 0.3),
    ], "REIT quality uses occupancy and recurring property/AFFO growth rather than industrial ROIC or ROA.");
    dimensions.risk = dimension("risk", [
      c("Net debt / EBITDAre", reit?.netDebtToEbitdare.value ?? null, scoreLowerIsBetter(reit?.netDebtToEbitdare.value ?? null, 8, 4), 0.4),
      c("Fixed-charge coverage", reit?.fixedChargeCoverage.value ?? null, scoreHigherIsBetter(reit?.fixedChargeCoverage.value ?? null, 1.2, 3), 0.4),
      c("Beta", input.market?.beta ?? null, scoreLowerIsBetter(input.market?.beta ?? null, 1.6, 0.7), 0.2),
    ], "REIT risk uses property leverage, fixed-charge coverage and bounded market sensitivity instead of industrial interest coverage.");
  }

  if (archetype === "software_growth") {
    dimensions.growth = dimension("growth", [
      ...dimensions.growth.contributors ?? [],
      c("Growth + FCF margin", isFiniteNumber(metrics.growth.revenueGrowthYoY) && isFiniteNumber(metrics.margins.freeCashFlowMargin) ? metrics.growth.revenueGrowthYoY + metrics.margins.freeCashFlowMargin : null, scoreHigherIsBetter(isFiniteNumber(metrics.growth.revenueGrowthYoY) && isFiniteNumber(metrics.margins.freeCashFlowMargin) ? metrics.growth.revenueGrowthYoY + metrics.margins.freeCashFlowMargin : null, 0, 0.4), 0.25),
    ], "Growth is balanced against cash generation rather than rewarded in isolation.");
    dimensions.quality = dimension("quality", [
      ...dimensions.quality.contributors ?? [],
      c("SBC / revenue", metrics.cashFlow.stockBasedCompensationToRevenue, scoreLowerIsBetter(metrics.cashFlow.stockBasedCompensationToRevenue, 0.25, 0.03), 0.25),
    ], "Dilution and stock-based compensation are explicit quality costs.");
  }

  if (archetype === "cyclical") {
    dimensions.profitability = dimension("profitability", [
      c("Operating margin", metrics.margins.operatingMargin, scoreHigherIsBetter(metrics.margins.operatingMargin, 0, 0.18), 0.3),
      c("Operating margin stability", metrics.cashFlow.operatingMarginStability, scoreHigherIsBetter(metrics.cashFlow.operatingMarginStability, 0.2, 0.8), 0.4),
      c("ROIC", metrics.ratios.returnOnInvestedCapital, scoreHigherIsBetter(metrics.ratios.returnOnInvestedCapital, 0.03, 0.15), 0.3),
    ], "Through-cycle stability prevents one peak margin year from dominating.");
    dimensions.growth = dimension("growth", [
      c("Revenue CAGR 5Y", metrics.growth.revenueCagr5y, scoreHigherIsBetter(metrics.growth.revenueCagr5y, -0.03, 0.08), 0.6),
      c("FCF stability", metrics.cashFlow.freeCashFlowStability, scoreHigherIsBetter(metrics.cashFlow.freeCashFlowStability, 0.2, 0.8), 0.4),
    ], "Longer-cycle observations replace peak-year growth emphasis.");
  }

  if (archetype === "pre_revenue_biotech") {
    const burn = isFiniteNumber(metrics.cashFlow.simpleFreeCashFlow) && metrics.cashFlow.simpleFreeCashFlow < 0
      ? Math.abs(metrics.cashFlow.simpleFreeCashFlow)
      : null;
    const runway = isFiniteNumber(latest?.cashAndEquivalents) && isFiniteNumber(burn) && burn > 0
      ? latest.cashAndEquivalents / burn
      : null;
    dimensions.growth = dimension("growth", [c("Revenue growth", null, null, 1, true)], "Pre-revenue companies are not penalized with meaningless earnings growth metrics.");
    dimensions.profitability = dimension("profitability", [c("R&D investment", latest?.researchAndDevelopment ?? null, null, 1)], "Pipeline economics require specialized clinical data not exposed by the current provider.");
    dimensions.financialHealth = dimension("financialHealth", [
      c("Cash runway (years)", runway, scoreHigherIsBetter(runway, 0.5, 3), 0.7),
      c("Share dilution", metrics.trends.sharesDilutionYoY, scoreLowerIsBetter(metrics.trends.sharesDilutionYoY, 0.25, 0), 0.3),
    ], "Cash runway and dilution replace corporate leverage metrics.");
    dimensions.valuation = dimension("valuation", [c("Pipeline valuation", null, null, 1, true)], "Risk-adjusted pipeline valuation requires real asset-level probabilities and is unavailable.");
  }

  if (archetype === "holding_company") {
    dimensions.profitability = dimension("profitability", [c("Operating margins", null, null, 1, true)], "Operating-company margins are unsuitable for holding-company economics.");
    dimensions.valuation = dimension("valuation", [c("NAV / SOTP", null, null, 1)], "NAV and look-through holdings data are required for valuation.");
  }

  if (input.company.investmentProfile === "dividend" && ["standard", "software_growth", "cyclical", "utility"].includes(archetype)) {
    dimensions.cashFlow = dimension("cashFlow", [
      c("Dividend yield", metrics.cashFlow.dividendYield, scoreTargetRange(metrics.cashFlow.dividendYield, 0, 0.02, 0.06, 0.12), 0.2),
      c("FCF payout ratio", metrics.cashFlow.freeCashFlowPayoutRatio, scoreTargetRange(metrics.cashFlow.freeCashFlowPayoutRatio, 0, 0.2, 0.7, 1.2), 0.35),
      c("Dividend growth YoY", metrics.cashFlow.dividendGrowthYoY, scoreHigherIsBetter(metrics.cashFlow.dividendGrowthYoY, -0.1, 0.1), 0.2),
      c("Dividend CAGR 3Y", metrics.cashFlow.dividendCagr3y, scoreHigherIsBetter(metrics.cashFlow.dividendCagr3y, -0.03, 0.1), 0.25),
    ], "Yield is rewarded only alongside free-cash-flow coverage and dividend growth.");
  } else if (input.company.investmentProfile === "dividend" && archetype === "reit") {
    const reit = input.specialized?.kind === "reit" ? input.specialized : null;
    dimensions.cashFlow = dimension("cashFlow", [
      c("Dividend yield", metrics.cashFlow.dividendYield, scoreTargetRange(metrics.cashFlow.dividendYield, 0, 0.02, 0.06, 0.12), 0.2),
      c("AFFO payout", reit?.adjustedFundsFromOperationsPayout.value ?? null, scoreTargetRange(reit?.adjustedFundsFromOperationsPayout.value ?? null, 0, 0.25, 0.8, 1.2), 0.3),
      c("Dividend coverage", reit?.dividendCoverage.value ?? null, scoreHigherIsBetter(reit?.dividendCoverage.value ?? null, 0.8, 1.5), 0.3),
      c("AFFO growth", reit?.adjustedFundsFromOperationsGrowth.value ?? null, scoreHigherIsBetter(reit?.adjustedFundsFromOperationsGrowth.value ?? null, -0.08, 0.1), 0.2),
    ], "REIT dividends require reported AFFO payout and dividend coverage rather than generic FCF payout.");
  }

  return dimensions;
}

function aggregate(dimensions: Record<ScoreDimensionKey, ScoreDimension>, weights: Record<ScoreDimensionKey, number>) {
  const entries = Object.entries(weights) as Array<[ScoreDimensionKey, number]>;
  const applicable = entries.filter(([key]) => (dimensions[key].plannedWeight ?? 0) > 0);
  const applicableWeight = applicable.reduce((sum, [, weight]) => sum + weight, 0);
  const coverage = applicableWeight > 0
    ? applicable.reduce((sum, [key, weight]) => sum + (dimensions[key].coverage ?? 0) * weight, 0) / applicableWeight
    : 0;
  const available = applicable.filter(([key]) => isFiniteNumber(dimensions[key].score));
  const availableWeight = available.reduce((sum, [, weight]) => sum + weight, 0);
  const rawScore = availableWeight > 0
    ? available.reduce((sum, [key, weight]) => sum + (dimensions[key].score as number) * weight, 0) / availableWeight
    : null;
  const score = rawScore === null || coverage < SCORE_COVERAGE_POLICY.overallMinimum
    ? null
    : 50 + (rawScore - 50) * coverage;
  return { score: isFiniteNumber(score) ? clamp(score, 0, 100) : null, coverage };
}

function freshnessScore(input: FinancialAnalysisInput, metrics: FinancialMetrics): number {
  const end = metrics.latestPeriod?.periodEndDate;
  if (!end) return 35;
  const age = (Date.parse(input.analysisDate ?? new Date().toISOString()) - Date.parse(end)) / 86_400_000;
  if (!Number.isFinite(age)) return 35;
  if (age <= 120) return 100;
  if (age <= 240) return 80;
  if (age <= 400) return 60;
  return 30;
}

function sourceQuality(input: FinancialAnalysisInput): number {
  const diagnostics = input.providerDiagnostics ?? [];
  const coreCapabilities = new Set(["fundamentals", "market_data", "estimates"] as const);
  const coreDiagnostics = diagnostics.filter((item) => coreCapabilities.has(item.capability as "fundamentals" | "market_data" | "estimates"));
  if (!coreDiagnostics.length) return 60;
  const statusScore = { available: 100, partial: 65, unavailable: 20, unsupported: 20 } as const;
  const bestByCapability = new Map<string, number>();
  for (const item of coreDiagnostics) {
    const score = statusScore[item.status];
    bestByCapability.set(item.capability, Math.max(bestByCapability.get(item.capability) ?? 0, score));
  }
  const scores = [...bestByCapability.values()];
  return scores.reduce((sum, score) => sum + score, 0) / scores.length;
}

function marketInputFreshness(input: FinancialAnalysisInput): number {
  if (!isFiniteNumber(input.market?.price)) return 20;
  if (!input.market?.priceDate) return 55;
  const analysisTime = Date.parse(input.analysisDate ?? new Date().toISOString());
  const marketTime = Date.parse(input.market.priceDate);
  const ageDays = (analysisTime - marketTime) / 86_400_000;
  if (!Number.isFinite(ageDays) || ageDays < -1) return 0;
  if (ageDays <= 10) return 100;
  return 10;
}

function valuationAssumptionConfidence(
  quality: ValuationAssumptionQuality | null | undefined,
  status: "available" | "unavailable" | "inappropriate" | undefined,
): number {
  if (status === "inappropriate") return 100;
  if (status === "unavailable") return 20;
  if (!quality) return 50;
  if (quality.level === "high") return 100;
  if (quality.level === "moderate") return 65;
  return 20;
}

export function computeScores(
  input: FinancialAnalysisInput,
  metrics: FinancialMetrics,
  context: {
    reconciliation?: number;
    valuationAssumptionQuality?: ValuationAssumptionQuality | null;
    valuationStatus?: "available" | "unavailable" | "inappropriate";
  } = {},
): ScoreResult {
  const sector = input.company.sector ?? "other";
  const investmentProfile = input.company.investmentProfile ?? "balanced";
  const analysisArchetype = resolveFinancialArchetype(input);
  const sectorWeights = weightsForSector(sector);
  const personalizedWeights = weightsForSectorAndProfile(sector, investmentProfile);
  const dimensions = archetypeDimensions(input, metrics, analysisArchetype);
  const general = aggregate(dimensions, sectorWeights);
  const personalized = aggregate(dimensions, personalizedWeights);
  const shortTerm = aggregate(dimensions, shortTermWeights);
  const longTerm = aggregate(dimensions, longTermWeights);
  const specializedCoverage = specializedCoverageFor(analysisArchetype, input.company, input.specialized);
  for (const key of Object.keys(dimensions) as ScoreDimensionKey[]) dimensions[key].weight = sectorWeights[key];

  const estimateAvailability = input.estimates && Object.values(input.estimates).some(isFiniteNumber) ? 90 : 45;
  const valuationInputs = isFiniteNumber(metrics.valuation.marketCap) && isFiniteNumber(metrics.valuation.enterpriseValue) ? 100 : isFiniteNumber(metrics.valuation.marketCap) ? 60 : 20;
  const currencyState = valuationCurrencyAlignment(input, metrics.latestPeriod);
  const classification = input.company.classificationDiagnostics;
  const sourceConflictPolicy = summarizeSourceConflicts(input);
  const confidenceBreakdown: ConfidenceBreakdown = {
    dataCoverage: Math.round(general.coverage * 100),
    dataFreshness: Math.round(freshnessScore(input, metrics)),
    sourceQuality: Math.round(sourceQuality(input)),
    reconciliation: Math.round(context.reconciliation ?? 70),
    estimateAvailability,
    valuationInputs,
    entityIdentity: Math.round(clamp(
      input.company.entityIdentityConfidence ?? (input.company.entityId || input.company.cik ? 90 : 70),
      0,
      100,
    )),
    currencyAlignment: currencyState === "aligned" ? 100 : currencyState === "unknown" ? 25 : 0,
    archetypeConfidence: Math.round(clamp(
      classification
        ? classification.ambiguous
          ? Math.min(classification.confidence * 100, 35)
          : classification.confidence * 100
        : analysisArchetype === "unknown"
          ? 0
          : input.company.analysisArchetype
            ? 90
            : 70,
      0,
      100,
    )),
    specializedCoverage: specializedCoverage ? Math.round(specializedCoverage.overall * 100) : null,
    marketInputFreshness: marketInputFreshness(input),
    valuationAssumptions: valuationAssumptionConfidence(context.valuationAssumptionQuality, context.valuationStatus),
    sourceConflict: sourceConflictPolicy.confidenceScore,
  };
  const confidenceComponents: Array<[number | null, number]> = [
    [confidenceBreakdown.dataCoverage, 0.25], [confidenceBreakdown.dataFreshness, 0.15],
    [confidenceBreakdown.sourceQuality, 0.08], [confidenceBreakdown.reconciliation, 0.08],
    [confidenceBreakdown.estimateAvailability, 0.03], [confidenceBreakdown.valuationInputs, 0.05],
    [confidenceBreakdown.entityIdentity, 0.05], [confidenceBreakdown.currencyAlignment, 0.08],
    [confidenceBreakdown.archetypeConfidence, 0.05], [confidenceBreakdown.specializedCoverage, 0.06],
    [confidenceBreakdown.marketInputFreshness, 0.05], [confidenceBreakdown.valuationAssumptions, 0.03],
    [confidenceBreakdown.sourceConflict, 0.04],
  ];
  let confidenceWeightedSum = 0;
  let confidenceWeight = 0;
  for (const [value, weight] of confidenceComponents) {
    if (value === null) continue;
    confidenceWeightedSum += value * weight;
    confidenceWeight += weight;
  }
  const uncappedConfidence = confidenceWeight > 0 ? confidenceWeightedSum / confidenceWeight : 5;
  let confidenceCeiling = 98;
  if (general.score === null) {
    confidenceCeiling = Math.min(confidenceCeiling, general.coverage < 0.35 ? 40 : 55);
  }
  if (analysisArchetype === "unknown") confidenceCeiling = Math.min(confidenceCeiling, 35);
  if (classification?.ambiguous) confidenceCeiling = Math.min(confidenceCeiling, 40);
  if (["bank", "insurer", "reit"].includes(analysisArchetype) && specializedCoverage) {
    if (specializedCoverage.overall < 0.3) confidenceCeiling = Math.min(confidenceCeiling, 45);
    else if (specializedCoverage.overall < 0.7) confidenceCeiling = Math.min(confidenceCeiling, 60);
  }
  const confidence = Math.round(clamp(Math.min(uncappedConfidence, confidenceCeiling), 5, 98));
  const missingData = [...metrics.missingData, ...Object.values(dimensions).flatMap((item) => item.missingData ?? [])];
  const archetypeCanBeScored = !["unknown", "pre_revenue_biotech", "holding_company"].includes(analysisArchetype);
  return {
    stockBoxScore: !archetypeCanBeScored || general.score === null ? null : Math.round(general.score * 10) / 10,
    personalizedScore: !archetypeCanBeScored || personalized.score === null ? null : Math.round(personalized.score * 10) / 10,
    investmentProfile,
    sector,
    analysisArchetype,
    confidence,
    confidenceBreakdown,
    dataCoverage: general.coverage,
    dimensions,
    shortTermScore: !archetypeCanBeScored || shortTerm.score === null ? null : Math.round(shortTerm.score),
    longTermScore: !archetypeCanBeScored || longTerm.score === null ? null : Math.round(longTerm.score),
    specializedCoverage,
    methodology: {
      modelVersion: MODEL_VERSION,
      scorePolicyVersion: SCORE_POLICY_VERSION,
      benchmarkVersion: STATIC_BENCHMARK_VERSION,
      sectorWeights,
      personalizedWeights,
    },
    missingData,
  };
}
