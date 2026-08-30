import { describe, expect, it } from "vitest";
import { analyzeFinancials, computeFinancialMetrics, computeScores } from "../../src/lib/analysis";
import { durableCompounderInput } from "./fixtures";

describe("provider confidence", () => {
  it("does not penalize core analysis confidence for unsupported optional research capabilities", () => {
    const input = {
      ...durableCompounderInput,
      providerDiagnostics: [
        { provider: "SEC", capability: "fundamentals" as const, status: "available" as const, observedAt: "2026-08-25T00:00:00.000Z" },
        { provider: "Yahoo", capability: "market_data" as const, status: "available" as const, observedAt: "2026-08-25T00:00:00.000Z" },
        { provider: "Optional", capability: "insider" as const, status: "unsupported" as const, observedAt: "2026-08-25T00:00:00.000Z" },
        { provider: "Optional", capability: "macro" as const, status: "unsupported" as const, observedAt: "2026-08-25T00:00:00.000Z" },
      ],
    };

    const metrics = computeFinancialMetrics(input);
    const score = computeScores(input, metrics);

    expect(score.confidenceBreakdown.sourceQuality).toBe(100);
  });
});


it("does not penalize source quality when a fallback provider resolves the same core capability", () => {
  const input = {
    ...durableCompounderInput,
    providerDiagnostics: [
      { provider: "Yahoo fundamentals", capability: "fundamentals" as const, status: "available" as const, observedAt: "2026-08-25T00:00:00.000Z" },
      { provider: "Stooq", capability: "market_data" as const, status: "unavailable" as const, observedAt: "2026-08-25T00:00:00.000Z" },
      { provider: "Yahoo chart", capability: "market_data" as const, status: "available" as const, observedAt: "2026-08-25T00:00:00.000Z" },
    ],
  };

  const metrics = computeFinancialMetrics(input);
  const score = computeScores(input, metrics);

  expect(score.confidenceBreakdown.sourceQuality).toBe(100);
});

it("penalizes unknown reporting-currency alignment", () => {
  const aligned = {
    ...durableCompounderInput,
    company: { ...durableCompounderInput.company, reportingCurrency: "USD", tradingCurrency: "USD" },
    annualPeriods: durableCompounderInput.annualPeriods.map((period) => ({ ...period, currency: "USD" })),
    market: { ...durableCompounderInput.market, currency: "USD" },
  };
  const unknown = {
    ...aligned,
    company: { ...aligned.company, currency: undefined, reportingCurrency: undefined },
    annualPeriods: aligned.annualPeriods.map((period) => ({ ...period, currency: undefined })),
  };

  const alignedScore = computeScores(aligned, computeFinancialMetrics(aligned));
  const unknownScore = computeScores(unknown, computeFinancialMetrics(unknown));

  expect(alignedScore.confidenceBreakdown.currencyAlignment).toBe(100);
  expect(unknownScore.confidenceBreakdown.currencyAlignment).toBeLessThan(40);
  expect(unknownScore.confidence).toBeLessThan(alignedScore.confidence);
});

it("penalizes historical high provider conflicts without treating them as blocking conflicts", () => {
  const historicalConflict = {
    ...durableCompounderInput,
    sourceConflicts: [{
      metric: "totalDebt",
      periodEnd: "2022-12-31",
      primaryProvider: "sec",
      secondaryProvider: "yahoo-fundamentals",
      primaryValue: 95,
      secondaryValue: 130,
      relativeDifference: 0.27,
      severity: "high" as const,
      reason: "Historical provider debt values differ materially.",
    }],
  };
  const metrics = computeFinancialMetrics(durableCompounderInput);

  const clean = computeScores(durableCompounderInput, metrics);
  const conflicted = computeScores(historicalConflict, metrics);

  expect(conflicted.confidenceBreakdown.sourceConflict).toBeGreaterThan(0);
  expect(conflicted.confidenceBreakdown.sourceConflict).toBeLessThan(clean.confidenceBreakdown.sourceConflict);
  expect(conflicted.confidence).toBeLessThan(clean.confidence);
});

it("penalizes low-confidence archetype classification", () => {
  const highConfidence = {
    ...durableCompounderInput,
    company: {
      ...durableCompounderInput.company,
      analysisArchetype: "standard" as const,
      classificationDiagnostics: {
        reason: "Verified operating-company classification.",
        source: "sic" as const,
        confidence: 0.98,
        ambiguous: false,
        candidates: ["standard" as const],
      },
    },
  };
  const lowConfidence = {
    ...highConfidence,
    company: {
      ...highConfidence.company,
      classificationDiagnostics: {
        ...highConfidence.company.classificationDiagnostics,
        source: "fallback" as const,
        confidence: 0.25,
        ambiguous: true,
      },
    },
  };
  const metrics = computeFinancialMetrics(highConfidence);

  const high = computeScores(highConfidence, metrics);
  const low = computeScores(lowConfidence, metrics);

  expect(low.confidenceBreakdown.archetypeConfidence).toBe(25);
  expect(low.confidence).toBeLessThan(high.confidence);
});

it("does not count non-positive growth endpoints as missing data coverage", () => {
  const lossMaker = {
    ...durableCompounderInput,
    annualPeriods: durableCompounderInput.annualPeriods.map((period) => ({
      ...period,
      epsDiluted: period.fiscalYear === 2021 ? -0.3 : period.epsDiluted,
      operatingCashFlow: period.fiscalYear === 2021 ? -20 : period.operatingCashFlow,
      capitalExpenditures: period.fiscalYear === 2021 ? -10 : period.capitalExpenditures,
    })),
  };

  const score = computeScores(lossMaker, computeFinancialMetrics(lossMaker));
  const growth = score.dimensions.growth;

  expect(growth.contributors?.find((item) => item.label === "EPS CAGR 3Y")?.availability).toBe("unsuitable");
  expect(growth.contributors?.find((item) => item.label === "FCF/share CAGR 3Y")?.availability).toBe("unsuitable");
  expect(growth.missingData?.map((item) => item.field)).toEqual(expect.arrayContaining([
    "EPS CAGR 3Y",
    "FCF/share CAGR 3Y",
  ]));
  expect(growth.coverage).toBe(1);
});

it("penalizes missing specialized coverage for banks", () => {
  const missing = analyzeFinancials({
    ...durableCompounderInput,
    company: { ...durableCompounderInput.company, sector: "financials", analysisArchetype: "bank" },
  });
  const metric = (value: number) => ({ value, dataAsOf: "2026-06-30" });
  const complete = analyzeFinancials({
    ...durableCompounderInput,
    company: { ...durableCompounderInput.company, sector: "financials", analysisArchetype: "bank" },
    specialized: {
      kind: "bank",
      netInterestIncome: metric(80), netInterestMargin: metric(0.03), grossLoans: metric(1_000),
      deposits: metric(1_100), depositGrowth: metric(0.05), netInterestIncomeGrowth: metric(0.06),
      grossLoanGrowth: metric(0.04), fundingCost: metric(0.02),
      cet1CapitalRatio: metric(0.14), tangibleCommonEquity: metric(180), tangibleBookValuePerShare: metric(18),
      nonPerformingLoans: metric(10), netChargeOffs: metric(3), loanLossProvisions: metric(5),
      efficiencyRatio: metric(0.5), returnOnAssets: metric(0.014), returnOnEquity: metric(0.16),
      returnOnTangibleCommonEquity: metric(0.18),
    },
  });

  expect(missing.confidenceBreakdown.specializedCoverage).toBe(0);
  expect(complete.confidenceBreakdown.specializedCoverage).toBe(100);
  expect(missing.scores.confidence).toBeLessThanOrEqual(45);
  expect(missing.scores.confidence).toBeLessThan(complete.scores.confidence);
});

it("caps confidence when the financial archetype is unresolved", () => {
  const unresolved = analyzeFinancials({
    ...durableCompounderInput,
    company: {
      ...durableCompounderInput.company,
      sector: "financials",
      analysisArchetype: "unknown",
      classificationDiagnostics: {
        reason: "Financial-services evidence is ambiguous.",
        source: "fallback",
        confidence: 0.3,
        ambiguous: true,
        candidates: ["unknown"],
      },
    },
  });

  expect(unresolved.scores.stockBoxScore).toBeNull();
  expect(unresolved.scores.confidence).toBeLessThanOrEqual(35);
});

it("penalizes fallback-heavy valuation assumptions", () => {
  const currentInput = {
    ...durableCompounderInput,
    analysisDate: "2025-01-05T00:00:00.000Z",
    market: {
      ...durableCompounderInput.market,
      currency: "USD",
      priceDate: "2025-01-03",
      marketCapAsOf: "2025-01-03",
      sharesOutstandingAsOf: "2025-01-03",
    },
  };
  const fallbackHeavy = analyzeFinancials({
    ...currentInput,
    annualPeriods: currentInput.annualPeriods.map((period) => ({ ...period, interestExpense: null, pretaxIncome: null, incomeTaxExpense: null })),
    market: { ...currentInput.market, beta: null },
    dcfAssumptions: { baseFreeCashFlow: 250 },
  });
  const configured = analyzeFinancials({
    ...currentInput,
    dcfAssumptions: {
      riskFreeRate: 0.04,
      equityRiskPremium: 0.05,
      countryRiskPremium: 0,
      preTaxCostOfDebt: 0.05,
      discountRate: 0.09,
      terminalGrowthRate: 0.02,
      fcfGrowthRates: [0.08, 0.06, 0.05, 0.04, 0.03],
      forecastYears: 5,
    },
  });

  expect(fallbackHeavy.confidenceBreakdown.valuationAssumptions).toBeLessThan(40);
  expect(configured.confidenceBreakdown.valuationAssumptions).toBeGreaterThan(60);
  expect(fallbackHeavy.scores.confidence).toBeLessThan(configured.scores.confidence);
});

it("penalizes stale market inputs independently from business quality", () => {
  const current = {
    ...durableCompounderInput,
    analysisDate: "2026-08-25T00:00:00.000Z",
    market: { ...durableCompounderInput.market, priceDate: "2026-08-24" },
  };
  const stale = { ...current, market: { ...current.market, priceDate: "2026-06-01" } };
  const metrics = computeFinancialMetrics(current);

  const currentScore = computeScores(current, metrics);
  const staleScore = computeScores(stale, metrics);

  expect(currentScore.confidenceBreakdown.marketInputFreshness).toBe(100);
  expect(staleScore.confidenceBreakdown.marketInputFreshness).toBeLessThan(20);
  expect(staleScore.confidence).toBeLessThan(currentScore.confidence);
});

it("distinguishes not-applicable specialized coverage from complete specialist coverage", () => {
  const standard = analyzeFinancials({
    ...durableCompounderInput,
    company: { ...durableCompounderInput.company, sector: "industrials", analysisArchetype: "standard" },
  });
  const bank = analyzeFinancials({
    ...durableCompounderInput,
    company: { ...durableCompounderInput.company, sector: "financials", analysisArchetype: "bank" },
  });
  expect(standard.scores.specializedCoverage).toBeUndefined();
  expect(standard.confidenceBreakdown.specializedCoverage).toBeNull();
  expect(bank.confidenceBreakdown.specializedCoverage).toBe(0);
});
