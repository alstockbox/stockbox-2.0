import { describe, expect, it } from "vitest";
import { analyzeFinancials, toFinancialAnalysisInput } from "../../src/lib/analysis";
import { appleFy2025Input, durableCompounderInput, missingDataInput } from "./fixtures";

function datedDurableInput() {
  return {
    ...durableCompounderInput,
    analysisDate: "2025-06-30T00:00:00.000Z",
    annualPeriods: durableCompounderInput.annualPeriods.map((period) => ({
      ...period,
      periodEndDate: `${period.fiscalYear}-12-31`,
      balanceSheetDate: `${period.fiscalYear}-12-31`,
    })),
  };
}

describe("analyzeFinancials", () => {
  it("builds a complete deterministic analysis result", () => {
    const result = analyzeFinancials(durableCompounderInput);

    expect(result.modelVersion).toBe("stockbox-analysis-engine-v2.5.0");
    expect(result.reportSchemaVersion).toBe("stockbox-analysis-report-v5");
    expect(result.scores.stockBoxScore).toBeGreaterThan(70);
    expect(result.scores.methodology.personalizedWeights).not.toEqual(result.scores.methodology.sectorWeights);
    expect(result.recommendation.rating).toBe("Hold");
    expect(result.recommendation.constraintsApplied).toContain("Directional ratings require adequate valuation coverage.");
    expect(result.redFlags).toHaveLength(0);
    expect(result.scenarios.map((scenario) => scenario.name)).toEqual(["Bull", "Base", "Bear"]);
    expect(result.scenarios.every((scenario) => scenario.keyVariables.length > 0)).toBe(true);
  });

  it("keeps missing data visible and avoids high-conviction recommendations", () => {
    const result = analyzeFinancials(missingDataInput);

    expect(result.dcf.status).toBe("unavailable");
    expect(result.missingData.length).toBeGreaterThan(0);
    expect(result.recommendation.rating).not.toBe("Strong Buy");
    expect(result.scores.confidence).toBeLessThan(80);
  });

  it("does not issue directional ratings from cross-currency valuation inputs", () => {
    const result = analyzeFinancials({
      ...durableCompounderInput,
      company: { ...durableCompounderInput.company, currency: "SEK" },
      annualPeriods: durableCompounderInput.annualPeriods.map((period) => ({
        ...period,
        currency: "SEK",
      })),
      market: {
        ...durableCompounderInput.market,
        currency: "USD",
      },
    });

    expect(result.reconciliation.find((check) => check.code === "currency_alignment")?.status).toBe("warning");
    expect(result.dcf.status).toBe("unavailable");
    expect(["Buy", "Strong Buy", "Sell", "Strong Sell"]).not.toContain(result.recommendation.rating);
    expect(result.missingData).toEqual(expect.arrayContaining([
      expect.objectContaining({
        field: "currencyAlignment",
        impact: "metric",
      }),
    ]));
  });

  it("does not issue directional ratings from stale market prices", () => {
    const result = analyzeFinancials({
      ...durableCompounderInput,
      analysisDate: "2026-08-25T00:00:00.000Z",
      market: {
        ...durableCompounderInput.market,
        currency: "USD",
        priceDate: "2026-07-01",
      },
    });

    expect(result.diagnostics.marketPriceStatus).toBe("stale");
    expect(result.dcf.status).toBe("unavailable");
    expect(["Buy", "Strong Buy", "Sell", "Strong Sell"]).not.toContain(result.recommendation.rating);
    expect(result.missingData).toEqual(expect.arrayContaining([
      expect.objectContaining({
        field: "marketPriceFreshness",
        impact: "metric",
      }),
    ]));
  });

  it("does not score future-dated financial statements as historical fundamentals", () => {
    const result = analyzeFinancials({
      ...durableCompounderInput,
      analysisDate: "2026-08-25T00:00:00.000Z",
      annualPeriods: durableCompounderInput.annualPeriods.map((period, index) => ({
        ...period,
        periodEndDate: `2027-12-${String(28 + index).padStart(2, "0")}`,
        balanceSheetDate: `2027-12-${String(28 + index).padStart(2, "0")}`,
      })),
    });

    expect(result.dataStatus).toBe("unavailable");
    expect(result.metrics.latestPeriod).toBeNull();
    expect(result.scores.stockBoxScore).toBeNull();
    expect(result.recommendation.rating).toBe("No Rating");
    expect(result.scenarios).toEqual([]);
    expect(result.missingData).toEqual(expect.arrayContaining([
      expect.objectContaining({
        field: "futureFinancialData",
        severity: "high",
      }),
    ]));
  });

  it("does not score fundamentals across mixed reporting currencies", () => {
    const result = analyzeFinancials({
      ...durableCompounderInput,
      annualPeriods: durableCompounderInput.annualPeriods.map((period, index) => ({
        ...period,
        currency: index < 2 ? "EUR" : "USD",
      })),
      market: {
        ...durableCompounderInput.market,
        currency: "USD",
      },
    });

    expect(result.dataStatus).toBe("unavailable");
    expect(result.metrics.latestPeriod).toBeNull();
    expect(result.scores.stockBoxScore).toBeNull();
    expect(result.recommendation.rating).toBe("No Rating");
    expect(result.reconciliation.find((check) => check.code === "financial_currency_consistency")?.status).toBe("warning");
    expect(result.missingData).toEqual(expect.arrayContaining([
      expect.objectContaining({
        field: "financialCurrencyConsistency",
        severity: "high",
      }),
    ]));
  });

  it("does not score a period whose monetary facts conflict on reporting currency", () => {
    const result = analyzeFinancials({
      ...durableCompounderInput,
      annualPeriods: durableCompounderInput.annualPeriods.map((period, index) => ({
        ...period,
        currency: index === 3 ? undefined : "USD",
        currencyConflict: index === 3 ? ["EUR", "USD"] : undefined,
      })),
      market: {
        ...durableCompounderInput.market,
        currency: "USD",
      },
    });

    expect(result.dataStatus).toBe("unavailable");
    expect(result.scores.stockBoxScore).toBeNull();
    expect(result.recommendation.rating).toBe("No Rating");
    expect(result.missingData).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "financialCurrencyConsistency", severity: "high" }),
    ]));
  });

  it("keeps a historical secondary-provider disagreement visible without discarding current primary facts", () => {
    const datedInput = datedDurableInput();
    const clean = analyzeFinancials(datedInput);
    const result = analyzeFinancials({
      ...datedInput,
      sourceConflicts: [{
        metric: "totalDebt",
        periodEnd: "2022-12-31",
        primaryProvider: "sec",
        secondaryProvider: "yahoo-fundamentals",
        primaryValue: 190,
        secondaryValue: 250,
        relativeDifference: 0.24,
        severity: "high",
        reason: "Historical provider debt definitions differ materially.",
      }],
    });

    expect(result.dataStatus).not.toBe("unavailable");
    expect(result.scores.stockBoxScore).not.toBeNull();
    expect(result.scores.confidence).toBeLessThan(clean.scores.confidence);
    expect(result.reconciliation).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "provider_source_conflict", status: "warning" }),
    ]));
    expect(result.missingData).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "sourceConflict", severity: "medium" }),
    ]));
  });

  it("blocks a material disagreement affecting the latest financial period", () => {
    const result = analyzeFinancials({
      ...durableCompounderInput,
      sourceConflicts: [{
        metric: "revenue",
        periodEnd: null,
        primaryProvider: "sec",
        secondaryProvider: "yahoo-fundamentals",
        primaryValue: 1_200,
        secondaryValue: 1_700,
        relativeDifference: 0.29,
        severity: "high",
        reason: "Current provider revenue values differ materially.",
      }],
    });

    expect(result.dataStatus).toBe("unavailable");
    expect(result.scores.stockBoxScore).toBeNull();
    expect(result.recommendation.rating).toBe("No Rating");
  });

  it("always blocks a reporting-currency provider conflict", () => {
    const result = analyzeFinancials({
      ...durableCompounderInput,
      sourceConflicts: [{
        metric: "reportingCurrency",
        periodEnd: "2022-12-31",
        primaryProvider: "sec",
        secondaryProvider: "yahoo-fundamentals",
        primaryValue: "USD",
        secondaryValue: "TWD",
        relativeDifference: null,
        severity: "high",
        reason: "Providers disagree on the reporting currency.",
      }],
    });

    expect(result.dataStatus).toBe("unavailable");
    expect(result.scores.stockBoxScore).toBeNull();
    expect(result.recommendation.rating).toBe("No Rating");
  });

  it("always blocks an entity-identity provider conflict", () => {
    const result = analyzeFinancials({
      ...durableCompounderInput,
      sourceConflicts: [{
        metric: "entityId",
        periodEnd: "2022-12-31",
        primaryProvider: "sec",
        secondaryProvider: "yahoo-fundamentals",
        primaryValue: "economic-company:sec-1",
        secondaryValue: "economic-company:yahoo-2",
        relativeDifference: null,
        severity: "high",
        reason: "Providers disagree on issuer identity.",
      }],
    });

    expect(result.dataStatus).toBe("unavailable");
    expect(result.scores.stockBoxScore).toBeNull();
    expect(result.recommendation.rating).toBe("No Rating");
  });

  it("keeps medium source conflicts non-blocking while reducing confidence", () => {
    const datedInput = datedDurableInput();
    const clean = analyzeFinancials(datedInput);
    const result = analyzeFinancials({
      ...datedInput,
      sourceConflicts: [{
        metric: "revenue",
        periodEnd: "2022-12-31",
        primaryProvider: "sec",
        secondaryProvider: "yahoo-fundamentals",
        primaryValue: 850,
        secondaryValue: 900,
        relativeDifference: 0.06,
        severity: "medium",
        reason: "Historical provider revenue values differ within the review band.",
      }],
    });

    expect(result.dataStatus).not.toBe("unavailable");
    expect(result.scores.stockBoxScore).not.toBeNull();
    expect(result.scores.confidence).toBeLessThan(clean.scores.confidence);
    expect(result.missingData).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "sourceConflict", severity: "medium" }),
    ]));
  });

  it("penalizes multiple historical high conflicts without blocking current SEC facts", () => {
    const datedInput = datedDurableInput();
    const single = analyzeFinancials({
      ...datedInput,
      sourceConflicts: [{
        metric: "totalDebt",
        periodEnd: "2022-12-31",
        primaryProvider: "sec",
        secondaryProvider: "yahoo-fundamentals",
        primaryValue: 190,
        secondaryValue: 250,
        relativeDifference: 0.24,
        severity: "high",
        reason: "Historical provider debt values differ materially.",
      }],
    });
    const multiple = analyzeFinancials({
      ...datedInput,
      sourceConflicts: [
        ...single.sourceConflicts,
        {
          metric: "totalEquity",
          periodEnd: "2021-12-31",
          primaryProvider: "sec",
          secondaryProvider: "yahoo-fundamentals",
          primaryValue: 300,
          secondaryValue: 390,
          relativeDifference: 0.23,
          severity: "high",
          reason: "Historical provider equity values differ materially.",
        },
      ],
    });

    expect(multiple.dataStatus).not.toBe("unavailable");
    expect(multiple.scores.stockBoxScore).not.toBeNull();
    expect(multiple.scores.confidence).toBeLessThan(single.scores.confidence);
  });

  it("blocks when a historical conflict is accompanied by a current conflict", () => {
    const result = analyzeFinancials({
      ...durableCompounderInput,
      sourceConflicts: [{
        metric: "totalDebt",
        periodEnd: "2022-12-31",
        primaryProvider: "sec",
        secondaryProvider: "yahoo-fundamentals",
        primaryValue: 190,
        secondaryValue: 250,
        relativeDifference: 0.24,
        severity: "high",
        reason: "Historical provider debt values differ materially.",
      }, {
        metric: "revenue",
        periodEnd: null,
        primaryProvider: "sec",
        secondaryProvider: "yahoo-fundamentals",
        primaryValue: 1_200,
        secondaryValue: 1_700,
        relativeDifference: 0.29,
        severity: "high",
        reason: "Current provider revenue values differ materially.",
      }],
    });

    expect(result.dataStatus).toBe("unavailable");
    expect(result.scores.stockBoxScore).toBeNull();
    expect(result.recommendation.rating).toBe("No Rating");
  });

  it("produces a production-equivalent Apple result with reconciled provenance", () => {
    const result = analyzeFinancials(appleFy2025Input);
    expect(result.metrics.cashFlow.simpleFreeCashFlow).toBe(98_767_000_000);
    expect(result.metrics.margins.grossMargin).not.toBeNull();
    expect(result.metrics.margins.operatingMargin).not.toBeNull();
    expect(result.metrics.margins.netMargin).not.toBeNull();
    expect(result.metrics.provenance.simpleFreeCashFlow.inputs).toEqual(["operatingCashFlow", "capitalExpenditures"]);
    expect(result.reconciliation.find((check) => check.code === "simple_fcf")?.status).toBe("pass");
  });
});


describe("identity and confidence safety", () => {
  it("does not assign perfect issuer identity confidence to an unresolved listing identity", () => {
    const canonical = toFinancialAnalysisInput({
      company: {
        ticker: "MC.PA",
        canonicalTicker: "MC.PA",
        name: "LVMH Moet Hennessy Louis Vuitton SE",
        entityId: "listing:unknown:MC.PA",
        matchType: "exact_canonical_ticker",
        matchConfidence: "high",
        primarySecurity: true,
      },
      fundamentals: { ticker: "MC.PA", name: "LVMH", sector: "consumer", industry: "Luxury Goods", annual: [] },
      market: null,
      analysisType: "deep",
      investmentProfile: "balanced",
    });

    expect(canonical.company.entityIdentityConfidence).toBeLessThan(80);
  });

  it("retains perfect identity confidence for a regulator-resolved SEC issuer", () => {
    const canonical = toFinancialAnalysisInput({
      company: { ticker: "AAPL", name: "Apple Inc.", cik: "0000320193", entityId: "sec:0000320193" },
      fundamentals: { ticker: "AAPL", name: "Apple Inc.", sector: "technology", industry: "Consumer Electronics", annual: [] },
      market: null,
      analysisType: "deep",
      investmentProfile: "balanced",
    });

    expect(canonical.company.entityIdentityConfidence).toBe(100);
  });

  it("caps confidence when weighted coverage is too low to issue a canonical score", () => {
    const result = analyzeFinancials({
      ...durableCompounderInput,
      analysisDate: "2026-08-27T12:00:00.000Z",
      company: {
        ...durableCompounderInput.company,
        analysisArchetype: "standard",
        entityIdentityConfidence: 100,
        classificationDiagnostics: {
          reason: "High-confidence operating-company classification.",
          source: "description",
          confidence: 0.9,
          ambiguous: false,
          candidates: ["standard"],
        },
      },
      annualPeriods: durableCompounderInput.annualPeriods.map((period) => ({
        fiscalYear: period.fiscalYear,
        periodEndDate: period.periodEndDate,
        currency: period.currency,
        revenue: period.revenue,
        operatingIncome: period.operatingIncome,
        netIncome: period.netIncome,
        epsDiluted: period.epsDiluted,
        totalAssets: period.totalAssets,
      })),
      market: {
        ...durableCompounderInput.market,
        priceDate: "2026-08-27",
        marketCapAsOf: "2026-08-27",
        sharesOutstandingAsOf: "2026-08-27",
      },
      providerDiagnostics: [
        { provider: "primary", capability: "fundamentals", status: "available", observedAt: "2026-08-27T12:00:00.000Z" },
        { provider: "primary", capability: "market_data", status: "available", observedAt: "2026-08-27T12:00:00.000Z" },
        { provider: "primary", capability: "estimates", status: "available", observedAt: "2026-08-27T12:00:00.000Z" },
      ],
    });

    expect(result.scores.stockBoxScore).toBeNull();
    expect(result.recommendation.rating).toBe("No Rating");
    expect(result.scores.confidence).toBeLessThanOrEqual(55);
  });
});

describe("financial currency normalization", () => {
  it("keeps reporting and trading currencies separate in the canonical input", () => {
    const canonical = toFinancialAnalysisInput({
      company: {
        ticker: "TSM",
        name: "Taiwan Semiconductor Manufacturing Company Limited",
        currency: "USD",
      },
      fundamentals: {
        ticker: "TSM",
        name: "Taiwan Semiconductor Manufacturing Company Limited",
        sector: "technology",
        industry: "Semiconductors",
        annual: [],
        annualPeriods: [{
          fiscalYear: 2025,
          periodEndDate: "2025-12-31",
          currency: "TWD",
          revenue: 100,
        }],
      },
      market: {
        ticker: "TSM",
        price: 200,
        currency: "USD",
        date: "2026-08-25",
        volume: 1,
        yearHigh: 220,
        yearLow: 120,
        performance: {},
      },
      analysisType: "summary",
      investmentProfile: "balanced",
    });

    expect(canonical.company).toMatchObject({
      reportingCurrency: "TWD",
      tradingCurrency: "USD",
    });
    expect(canonical.company.currency).toBe("TWD");
  });

  it("does not fill an unknown reporting currency from market or browser metadata", () => {
    const canonical = toFinancialAnalysisInput({
      company: {
        ticker: "UNKNOWN",
        name: "Unknown Reporting Currency",
        currency: "USD",
      },
      fundamentals: {
        ticker: "UNKNOWN",
        name: "Unknown Reporting Currency",
        sector: "industrials",
        industry: "Industrial Products",
        annual: [],
        annualPeriods: [{ fiscalYear: 2025, periodEndDate: "2025-12-31", revenue: 100 }],
      },
      market: {
        ticker: "UNKNOWN",
        price: 10,
        currency: "USD",
        date: "2026-08-25",
        volume: 1,
        yearHigh: 12,
        yearLow: 7,
        performance: {},
      },
      analysisType: "summary",
      investmentProfile: "balanced",
    });

    expect(canonical.company.reportingCurrency).toBeUndefined();
    expect(canonical.company.tradingCurrency).toBe("USD");
    expect(canonical.company.currency).toBeUndefined();
  });

  it("does not invent a second reporting currency from missing optional periods", () => {
    const result = analyzeFinancials({
      ...durableCompounderInput,
      company: { ...durableCompounderInput.company, currency: "USD" },
      annualPeriods: durableCompounderInput.annualPeriods.map((period) => ({
        ...period,
        currency: "TWD",
      })),
      trailingTwelveMonths: undefined,
      priorTrailingTwelveMonths: undefined,
      market: undefined,
    });

    expect(result.reconciliation.find((check) => check.code === "financial_currency_consistency")).toBeUndefined();
  });
});
