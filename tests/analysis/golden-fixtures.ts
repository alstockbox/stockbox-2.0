import type {
  AnalysisArchetype,
  FinancialAnalysisInput,
  FinancialPeriod,
  SpecializedMetric,
} from "../../src/lib/analysis";

export type GoldenAnalysisFixture = {
  id: string;
  input: FinancialAnalysisInput;
};

const analysisDate = "2025-01-15T12:00:00.000Z";

function annualPeriod(year: number, scale: number): FinancialPeriod {
  const revenue = 800 * scale;
  const operatingIncome = revenue * 0.18;
  const netIncome = revenue * 0.13;
  const operatingCashFlow = revenue * 0.2;
  return {
    fiscalYear: year,
    periodStartDate: `${year}-01-01`,
    periodEndDate: `${year}-12-31`,
    balanceSheetDate: `${year}-12-31`,
    periodBasis: "FY",
    currency: "USD",
    revenue,
    grossProfit: revenue * 0.58,
    operatingIncome,
    ebitda: revenue * 0.22,
    netIncome,
    epsDiluted: netIncome / 100,
    operatingCashFlow,
    capitalExpenditures: -(revenue * 0.04),
    cashAndEquivalents: 120 * scale,
    totalDebt: 180 * scale,
    totalEquity: 460 * scale,
    totalAssets: 900 * scale,
    totalLiabilities: 440 * scale,
    currentAssets: 300 * scale,
    currentLiabilities: 180 * scale,
    interestExpense: -(12 * scale),
    pretaxIncome: netIncome / 0.79,
    incomeTaxExpense: netIncome / 0.79 - netIncome,
    depreciationAndAmortization: revenue * 0.03,
    sharesDiluted: 100,
    currentSharesOutstanding: year === 2024 ? 100 : undefined,
    stockBasedCompensation: revenue * 0.01,
  };
}

function canonicalInput(): FinancialAnalysisInput {
  return {
    company: {
      ticker: "GOLD",
      canonicalTicker: "GOLD",
      entityId: "golden:standard",
      entityIdentityConfidence: 100,
      name: "Golden Standard Company",
      sector: "industrials",
      industry: "Industrial Technology",
      currency: "USD",
      reportingCurrency: "USD",
      tradingCurrency: "USD",
      analysisArchetype: "standard",
      classificationDiagnostics: {
        reason: "Deterministic golden fixture classification.",
        source: "explicit",
        confidence: 1,
        ambiguous: false,
        candidates: ["standard"],
      },
      investmentProfile: "balanced",
    },
    annualPeriods: [
      annualPeriod(2021, 0.72),
      annualPeriod(2022, 0.82),
      annualPeriod(2023, 0.91),
      annualPeriod(2024, 1),
    ],
    market: {
      price: 30,
      priceDate: "2025-01-10",
      currency: "USD",
      marketCap: 3_000,
      marketCapAsOf: "2025-01-10",
      marketCapCurrency: "USD",
      enterpriseValue: 3_060,
      sharesOutstanding: 100,
      sharesOutstandingAsOf: "2025-01-10",
      beta: 1.05,
      pricePerformance: {
        oneMonth: 0.03,
        threeMonth: 0.1,
        sixMonth: 0.16,
        yearToDate: 0.02,
        oneYear: 0.24,
      },
    },
    estimates: {
      nextYearRevenueGrowth: 0.1,
      nextYearEpsGrowth: 0.12,
      nextYearFreeCashFlowGrowth: 0.1,
    },
    analysisDate,
  };
}

function classify(input: FinancialAnalysisInput, archetype: AnalysisArchetype): void {
  input.company.analysisArchetype = archetype;
  input.company.classificationDiagnostics = {
    reason: `Deterministic ${archetype} golden fixture classification.`,
    source: "explicit",
    confidence: archetype === "unknown" ? 0 : 1,
    ambiguous: archetype === "unknown",
    candidates: [archetype],
  };
}

function metric(value: number | null, unit?: string): SpecializedMetric {
  return {
    value,
    unit,
    dataAsOf: "2024-12-31",
    definition: "Deterministic golden fixture value.",
  };
}

function fixture(
  id: string,
  mutate: (input: FinancialAnalysisInput) => void = () => undefined,
): GoldenAnalysisFixture {
  const input = structuredClone(canonicalInput());
  input.company.ticker = id.toUpperCase().slice(0, 10);
  input.company.canonicalTicker = input.company.ticker;
  input.company.entityId = `golden:${id}`;
  mutate(input);
  return { id, input };
}

function setOperatingPattern(input: FinancialAnalysisInput, scales: number[]): void {
  input.annualPeriods = scales.map((scale, index) => annualPeriod(2020 + index, scale));
}

export const goldenAnalysisFixtures: GoldenAnalysisFixture[] = [
  fixture("quality-compounder"),
  fixture("overvalued-compounder", (input) => {
    input.market!.price = 120;
    input.market!.marketCap = 12_000;
    input.market!.enterpriseValue = 12_060;
  }),
  fixture("cheap-deteriorating", (input) => {
    setOperatingPattern(input, [1.25, 1.12, 0.96, 0.8]);
    input.market!.price = 8;
    input.market!.marketCap = 800;
    input.market!.enterpriseValue = 900;
    input.market!.pricePerformance = { threeMonth: -0.22, oneYear: -0.38 };
  }),
  fixture("high-leverage-industrial", (input) => {
    for (const period of input.annualPeriods) {
      period.totalDebt = (period.revenue ?? 0) * 4;
      period.cashAndEquivalents = (period.revenue ?? 0) * 0.02;
      period.totalEquity = (period.revenue ?? 0) * 0.08;
      period.interestExpense = -((period.revenue ?? 0) * 0.15);
    }
  }),
  fixture("negative-fcf", (input) => {
    for (const period of input.annualPeriods) {
      period.operatingCashFlow = (period.revenue ?? 0) * 0.04;
      period.capitalExpenditures = -((period.revenue ?? 0) * 0.12);
    }
  }),
  fixture("software-growth", (input) => {
    classify(input, "software_growth");
    input.company.sector = "technology";
    input.company.industry = "Application Software";
    setOperatingPattern(input, [0.48, 0.62, 0.79, 1]);
  }),
  fixture("high-sbc-software", (input) => {
    classify(input, "software_growth");
    input.company.sector = "technology";
    input.company.industry = "Application Software";
    setOperatingPattern(input, [0.48, 0.62, 0.79, 1]);
    for (const period of input.annualPeriods) {
      period.stockBasedCompensation = (period.revenue ?? 0) * 0.24;
    }
  }),
  fixture("cyclical-peak", (input) => {
    classify(input, "cyclical");
    input.company.sector = "energy";
    input.company.industry = "Commodity Producer";
    setOperatingPattern(input, [0.72, 1.18, 0.63, 0.86, 1.55]);
  }),
  fixture("cyclical-trough", (input) => {
    classify(input, "cyclical");
    input.company.sector = "materials";
    input.company.industry = "Commodity Producer";
    setOperatingPattern(input, [1.22, 0.76, 1.38, 0.91, 0.55]);
  }),
  fixture("utility", (input) => {
    classify(input, "utility");
    input.company.sector = "utilities";
    input.company.industry = "Regulated Electric Utility";
  }),
  fixture("bank-complete", (input) => {
    classify(input, "bank");
    input.company.sector = "financials";
    input.company.industry = "Diversified Bank";
    input.specialized = {
      kind: "bank",
      netInterestIncome: metric(150),
      netInterestMargin: metric(0.032, "ratio"),
      grossLoans: metric(2_000),
      deposits: metric(2_250),
      depositGrowth: metric(0.06, "ratio"),
      netInterestIncomeGrowth: metric(0.05, "ratio"),
      grossLoanGrowth: metric(0.04, "ratio"),
      fundingCost: metric(0.018, "ratio"),
      cet1CapitalRatio: metric(0.135, "ratio"),
      tangibleCommonEquity: metric(420),
      tangibleBookValuePerShare: metric(24),
      nonPerformingLoans: metric(25),
      netChargeOffs: metric(7),
      loanLossProvisions: metric(12),
      efficiencyRatio: metric(0.56, "ratio"),
      returnOnAssets: metric(0.014, "ratio"),
      returnOnEquity: metric(0.15, "ratio"),
      returnOnTangibleCommonEquity: metric(0.17, "ratio"),
    };
  }),
  fixture("bank-missing-specialist", (input) => {
    classify(input, "bank");
    input.company.sector = "financials";
    input.company.industry = "Diversified Bank";
  }),
  fixture("insurer-complete", (input) => {
    classify(input, "insurer");
    input.company.sector = "financials";
    input.company.industry = "Property and Casualty Insurance";
    input.specialized = {
      kind: "insurer",
      premiumGrowth: metric(0.08, "ratio"),
      combinedRatio: metric(0.92, "ratio"),
      lossRatio: metric(0.62, "ratio"),
      expenseRatio: metric(0.3, "ratio"),
      bookValue: metric(1_900),
      tangibleBookValue: metric(1_650),
      returnOnEquity: metric(0.16, "ratio"),
      regulatoryCapitalRatio: metric(1.8, "ratio"),
      reserveDevelopment: metric(-0.01, "ratio"),
    };
  }),
  fixture("insurer-missing-specialist", (input) => {
    classify(input, "insurer");
    input.company.sector = "financials";
    input.company.industry = "Insurance";
  }),
  fixture("reit-complete", (input) => {
    classify(input, "reit");
    input.company.sector = "realEstate";
    input.company.industry = "Equity REIT";
    input.specialized = {
      kind: "reit",
      fundsFromOperations: metric(245),
      fundsFromOperationsPerShare: metric(2.45),
      adjustedFundsFromOperations: { ...metric(220), companyDefined: true },
      adjustedFundsFromOperationsPerShare: { ...metric(2.2), companyDefined: true },
      fundsFromOperationsGrowth: metric(0.06, "ratio"),
      adjustedFundsFromOperationsGrowth: metric(0.05, "ratio"),
      adjustedFundsFromOperationsPayout: metric(0.72, "ratio"),
      dividendCoverage: metric(1.3, "ratio"),
      occupancy: metric(0.96, "ratio"),
      sameStoreNoiGrowth: metric(0.045, "ratio"),
      netDebtToEbitdare: metric(5.2, "multiple"),
      debtMaturities: metric(0.12, "ratio"),
      fixedChargeCoverage: metric(2.6, "multiple"),
      netAssetValue: metric(3_400),
    };
  }),
  fixture("reit-missing-ffo", (input) => {
    classify(input, "reit");
    input.company.sector = "realEstate";
    input.company.industry = "Equity REIT";
  }),
  fixture("pre-revenue-biotech", (input) => {
    classify(input, "pre_revenue_biotech");
    input.company.sector = "healthcare";
    input.company.industry = "Biotechnology";
    for (const period of input.annualPeriods) {
      period.revenue = 0;
      period.grossProfit = null;
      period.operatingIncome = -120;
      period.ebitda = -110;
      period.netIncome = -130;
      period.operatingCashFlow = -95;
      period.capitalExpenditures = -5;
    }
  }),
  fixture("holding-company", (input) => {
    classify(input, "holding_company");
    input.company.sector = "financials";
    input.company.industry = "Diversified Holding Company";
  }),
  fixture("unknown-archetype", (input) => {
    classify(input, "unknown");
    input.company.sector = "other";
    input.company.industry = undefined;
  }),
  fixture("stale-fundamentals", (input) => {
    input.annualPeriods = [2018, 2019, 2020, 2021].map((year, index) => annualPeriod(year, 0.7 + index * 0.1));
  }),
  fixture("stale-market-price", (input) => {
    input.market!.priceDate = "2024-09-01";
    input.market!.marketCapAsOf = "2024-09-01";
    input.market!.sharesOutstandingAsOf = "2024-09-01";
  }),
  fixture("future-financials", (input) => {
    input.annualPeriods = [2026, 2027, 2028, 2029].map((year, index) => annualPeriod(year, 0.7 + index * 0.1));
  }),
  fixture("mixed-financial-currencies", (input) => {
    input.annualPeriods[0].currency = "EUR";
  }),
  fixture("unknown-financial-currency", (input) => {
    input.company.currency = undefined;
    input.company.reportingCurrency = undefined;
    input.annualPeriods.forEach((period) => {
      period.currency = undefined;
    });
  }),
  fixture("cross-currency", (input) => {
    input.company.tradingCurrency = "EUR";
    input.market!.currency = "EUR";
    input.market!.marketCapCurrency = "EUR";
  }),
  fixture("sparse-provider-data", (input) => {
    input.annualPeriods = [{
      fiscalYear: 2024,
      periodStartDate: "2024-01-01",
      periodEndDate: "2024-12-31",
      periodBasis: "FY",
      currency: "USD",
      revenue: 500,
      netIncome: 20,
    }];
    input.market = {
      price: 10,
      priceDate: "2025-01-10",
      currency: "USD",
      beta: 1.2,
      pricePerformance: {},
    };
  }),
  fixture("provider-conflict", (input) => {
    input.sourceConflicts = [{
      metric: "revenue",
      periodEnd: "2024-12-31",
      primaryProvider: "regulatory-fixture",
      secondaryProvider: "secondary-fixture",
      primaryValue: 800,
      secondaryValue: 1_200,
      relativeDifference: 0.5,
      severity: "high",
      reason: "Deterministic material cross-provider disagreement.",
    }];
  }),
  fixture("missing-fiscal-year-history", (input) => {
    input.annualPeriods = [
      annualPeriod(2020, 0.7),
      annualPeriod(2021, 0.8),
      annualPeriod(2023, 0.9),
      annualPeriod(2024, 1),
    ];
  }),
  fixture("diluted-shares-only", (input) => {
    input.annualPeriods.forEach((period) => {
      period.currentSharesOutstanding = undefined;
    });
    input.market!.sharesOutstanding = undefined;
    input.market!.sharesOutstandingAsOf = undefined;
    input.market!.marketCap = undefined;
    input.market!.marketCapAsOf = undefined;
    input.market!.enterpriseValue = undefined;
  }),
  fixture("extreme-outliers", (input) => {
    const latest = input.annualPeriods.at(-1)!;
    latest.revenue = 1;
    latest.grossProfit = 10_000;
    latest.operatingIncome = -10_000;
    latest.ebitda = 0;
    latest.netIncome = 1_000_000;
    latest.operatingCashFlow = -1_000_000;
    latest.capitalExpenditures = -1_000_000;
    latest.totalDebt = 1_000_000_000;
    latest.cashAndEquivalents = 0.0001;
    latest.totalEquity = -1;
    latest.totalAssets = 1;
    latest.totalLiabilities = 2;
    latest.interestExpense = -0.0001;
    input.market!.price = 0.0001;
    input.market!.marketCap = 0.01;
    input.market!.enterpriseValue = 1_000_000_000;
    input.market!.beta = 50;
  }),
];
