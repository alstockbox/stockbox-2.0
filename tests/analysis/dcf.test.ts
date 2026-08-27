import { describe, expect, it } from "vitest";
import { computeDcfRange, computeDiscountedCashFlow } from "../../src/lib/analysis";
import { durableCompounderInput, missingDataInput } from "./fixtures";

describe("DCF calculations", () => {
  it("computes a known discounted cash flow result", () => {
    const result = computeDiscountedCashFlow({
      baseFreeCashFlow: 100,
      forecastYears: 2,
      discountRate: 0.1,
      terminalGrowthRate: 0.02,
      fcfGrowthRates: [0, 0],
      netDebt: 0,
      sharesOutstanding: 10,
    });

    expect(result.presentValueOfCashFlows).toBeCloseTo(173.55, 2);
    expect(result.terminalValue).toBeCloseTo(1275, 2);
    expect(result.presentValueOfTerminalValue).toBeCloseTo(1053.72, 2);
    expect(result.enterpriseValue).toBeCloseTo(1227.27, 2);
    expect(result.perShareValue).toBeCloseTo(122.73, 2);
  });

  it("generates a deterministic bear/base/bull DCF range when inputs are suitable", () => {
    const result = computeDcfRange(durableCompounderInput);

    expect(result.status).toBe("available");
    expect(result.scenarios.map((scenario) => scenario.name)).toEqual(["Bear", "Base", "Bull"]);
    expect(result.low).toBeLessThan(result.mid as number);
    expect(result.mid).toBeLessThan(result.high as number);
    expect(result.scenarios[1].assumptions.forecastYears).toBe(5);
    expect(result.scenarios[1].assumptions.baseFreeCashFlow).toBeCloseTo(320 + 16 * 0.79 - 60, 5);
    expect(result.assumptionNotes).toEqual(expect.arrayContaining([expect.stringContaining("Fallback") ]));
  });

  it("refuses DCF when positive FCF or shares are missing", () => {
    const result = computeDcfRange(missingDataInput);

    expect(result.status).toBe("unavailable");
    expect(result.low).toBeNull();
    expect(result.missingData).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "baseFcff", impact: "dcf" }),
        expect.objectContaining({ field: "sharesOutstanding", impact: "dcf" }),
      ]),
    );
  });

  it("does not use diluted weighted-average shares for DCF per-share valuation", () => {
    const result = computeDcfRange({
      ...durableCompounderInput,
      annualPeriods: durableCompounderInput.annualPeriods.map((period) => ({
        ...period,
        currentSharesOutstanding: null,
      })),
      market: {
        ...durableCompounderInput.market,
        sharesOutstanding: null,
      },
    });

    expect(result.status).toBe("unavailable");
    expect(result.mid).toBeNull();
    expect(result.missingData).toEqual(expect.arrayContaining([
      expect.objectContaining({
        field: "sharesOutstanding",
        impact: "dcf",
        severity: "high",
      }),
    ]));
  });

  it("refuses DCF when financial and market currencies differ", () => {
    const result = computeDcfRange({
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

    expect(result.status).toBe("unavailable");
    expect(result.mid).toBeNull();
    expect(result.missingData).toEqual(expect.arrayContaining([
      expect.objectContaining({
        field: "currencyAlignment",
        impact: "dcf",
        severity: "high",
      }),
    ]));
  });

  it("refuses per-share DCF when market cap and quote-price share basis disagree materially", () => {
    const result = computeDcfRange({
      ...durableCompounderInput,
      analysisDate: "2026-08-25T00:00:00.000Z",
      market: {
        ...durableCompounderInput.market,
        price: 50,
        currency: "USD",
        priceDate: "2026-08-25",
        marketCap: 6_000,
        marketCapAsOf: "2026-08-25",
        marketCapCurrency: "USD",
        sharesOutstanding: 100,
        sharesOutstandingAsOf: "2026-08-25",
      },
      dcfAssumptions: {
        baseFreeCashFlow: 250,
        netDebt: 40,
        discountRate: 0.09,
        terminalGrowthRate: 0.02,
        forecastYears: 5,
        fcfGrowthRates: [0.08, 0.06, 0.05, 0.04, 0.03],
      },
    });

    expect(result.status).toBe("unavailable");
    expect(result.mid).toBeNull();
    expect(result.missingData).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "shareBasisAlignment", impact: "dcf", severity: "high" }),
    ]));
  });

  it("refuses DCF when the TTM balance sheet is more than 45 days behind the flow endpoint", () => {
    const latest = durableCompounderInput.annualPeriods.at(-1)!;
    const result = computeDcfRange({
      ...durableCompounderInput,
      analysisDate: "2026-08-25T00:00:00.000Z",
      trailingTwelveMonths: {
        ...latest,
        periodEndDate: "2026-06-30",
        balanceSheetDate: "2026-03-31",
        form: "TTM",
        periodBasis: "TTM_REPORTED",
      },
      market: {
        ...durableCompounderInput.market,
        priceDate: "2026-08-25",
        marketCapAsOf: "2026-08-25",
        sharesOutstandingAsOf: "2026-08-25",
      },
    });

    expect(result.status).toBe("unavailable");
    expect(result.missingData).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "balanceSheetAlignment", impact: "dcf", severity: "high" }),
    ]));
  });

  it("refuses DCF when market price data is stale", () => {
    const result = computeDcfRange({
      ...durableCompounderInput,
      analysisDate: "2026-08-25T00:00:00.000Z",
      market: {
        ...durableCompounderInput.market,
        currency: "USD",
        priceDate: "2026-07-01",
      },
    });

    expect(result.status).toBe("unavailable");
    expect(result.mid).toBeNull();
    expect(result.missingData).toEqual(expect.arrayContaining([
      expect.objectContaining({
        field: "marketPriceFreshness",
        impact: "dcf",
        severity: "high",
      }),
    ]));
  });

  it("refuses DCF when market price data is future-dated", () => {
    const result = computeDcfRange({
      ...durableCompounderInput,
      analysisDate: "2026-08-25T00:00:00.000Z",
      market: {
        ...durableCompounderInput.market,
        currency: "USD",
        priceDate: "2026-09-15",
      },
    });

    expect(result.status).toBe("unavailable");
    expect(result.mid).toBeNull();
    expect(result.missingData).toEqual(expect.arrayContaining([
      expect.objectContaining({
        field: "marketPriceFreshness",
        impact: "dcf",
        severity: "high",
      }),
    ]));
  });

  it("normalizes cyclical FCFF across contiguous comparable years instead of using a peak year", () => {
    const annualPeriods = [
      [2021, 120, 20],
      [2022, 140, 20],
      [2023, 110, 20],
      [2024, 1_000, 100],
    ].map(([fiscalYear, operatingCashFlow, capitalExpenditures]) => ({
      ...durableCompounderInput.annualPeriods[0],
      fiscalYear,
      periodStartDate: `${fiscalYear}-01-01`,
      periodEndDate: `${fiscalYear}-12-31`,
      revenue: 1_000,
      operatingCashFlow,
      capitalExpenditures,
      interestExpense: 10,
      pretaxIncome: 100,
      incomeTaxExpense: 21,
    }));
    const result = computeDcfRange({
      ...durableCompounderInput,
      company: { ...durableCompounderInput.company, sector: "energy", analysisArchetype: "cyclical" },
      annualPeriods,
      analysisDate: "2025-01-05T00:00:00.000Z",
      market: {
        ...durableCompounderInput.market,
        priceDate: "2025-01-03",
        marketCapAsOf: "2025-01-03",
        sharesOutstandingAsOf: "2025-01-03",
      },
    });

    expect(result.status).toBe("available");
    expect(result.method).toBe("Normalized FCFF DCF");
    expect(result.scenarios[1].assumptions.baseFreeCashFlow).toBeLessThan(200);
    expect(result.scenarios[1].assumptions.baseFreeCashFlow).toBeGreaterThan(80);
    expect(result.assumptionNotes).toEqual(expect.arrayContaining([
      expect.stringContaining("contiguous annual"),
    ]));
  });

  it("keeps cyclical DCF unavailable without enough contiguous cycle history", () => {
    const annualPeriods = durableCompounderInput.annualPeriods.slice(-3).map((period, index) => ({
      ...period,
      fiscalYear: 2020 + index * 2,
      periodEndDate: `${2020 + index * 2}-12-31`,
    }));
    const result = computeDcfRange({
      ...durableCompounderInput,
      company: { ...durableCompounderInput.company, sector: "materials", analysisArchetype: "cyclical" },
      annualPeriods,
      analysisDate: "2025-01-05T00:00:00.000Z",
      market: {
        ...durableCompounderInput.market,
        priceDate: "2025-01-03",
        marketCapAsOf: "2025-01-03",
        sharesOutstandingAsOf: "2025-01-03",
      },
    });

    expect(result.status).toBe("unavailable");
    expect(result.missingData).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "normalizedCycleHistory", impact: "dcf" }),
    ]));
  });

  it("marks a fallback-heavy DCF as illustrative rather than directional evidence", () => {
    const result = computeDcfRange(durableCompounderInput);

    expect(result.status).toBe("available");
    expect(result.directionalSupport).toBe(false);
    expect(result.assumptionQuality?.fallbackCount).toBeGreaterThanOrEqual(3);
    expect(result.assumptionQuality?.assumptions.riskFreeRate).toEqual(expect.objectContaining({
      value: 0.04,
      source: "StockBox configured fallback",
      valueKind: "fallback",
      version: expect.any(String),
    }));
  });

  it("keeps non-USD DCF illustrative without explicit country-risk premium", () => {
    const result = computeDcfRange({
      ...durableCompounderInput,
      company: { ...durableCompounderInput.company, currency: "SEK" },
      annualPeriods: durableCompounderInput.annualPeriods.map((period) => ({ ...period, currency: "SEK" })),
      market: {
        ...durableCompounderInput.market,
        currency: "SEK",
        beta: 1.05,
      },
      dcfAssumptions: {
        riskFreeRate: 0.035,
        equityRiskPremium: 0.055,
        preTaxCostOfDebt: 0.045,
        terminalGrowthRate: 0.02,
        fcfGrowthRates: [0.04, 0.035, 0.03, 0.025, 0.02],
      },
    });

    expect(result.status).toBe("available");
    expect(result.directionalSupport).toBe(false);
    expect(result.assumptionNotes).toEqual(expect.arrayContaining([
      expect.stringContaining("country risk premium"),
    ]));
  });

  it("reduces DCF confidence when terminal value dominates enterprise value", () => {
    const configured = {
      riskFreeRate: 0.04,
      equityRiskPremium: 0.05,
      preTaxCostOfDebt: 0.05,
      terminalGrowthRate: 0.005,
      discountRate: 0.12,
      fcfGrowthRates: [0.02, 0.02, 0.02, 0.02, 0.02],
    };
    const lowerTerminal = computeDcfRange({ ...durableCompounderInput, dcfAssumptions: configured });
    const dominantTerminal = computeDcfRange({
      ...durableCompounderInput,
      dcfAssumptions: { ...configured, discountRate: 0.06, terminalGrowthRate: 0.03 },
    });

    expect(dominantTerminal.terminalValueShare).toBeGreaterThan(0.75);
    expect(dominantTerminal.confidence).toBeLessThan(lowerTerminal.confidence as number);
  });

  it("rejects non-finite custom growth assumptions instead of emitting invalid values", () => {
    const result = computeDcfRange({
      ...durableCompounderInput,
      dcfAssumptions: { fcfGrowthRates: [0.1, Number.POSITIVE_INFINITY, Number.NaN] },
    });

    expect(result.status).toBe("unavailable");
    expect(result.missingData).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "fcfGrowthRates", severity: "high" }),
    ]));
    expect(JSON.stringify(result)).not.toMatch(/NaN|Infinity/);
  });

  it("rejects custom growth assumptions that do not cover the full forecast horizon", () => {
    const result = computeDcfRange({
      ...durableCompounderInput,
      dcfAssumptions: {
        forecastYears: 5,
        fcfGrowthRates: [0.08, 0.06],
      },
    });

    expect(result.status).toBe("unavailable");
    expect(result.missingData).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "fcfGrowthRates", severity: "high" }),
    ]));
  });

  it("rejects non-finite forecast horizons instead of throwing during scenario construction", () => {
    const result = computeDcfRange({
      ...durableCompounderInput,
      dcfAssumptions: {
        forecastYears: Number.POSITIVE_INFINITY,
      },
    });

    expect(result.status).toBe("unavailable");
    expect(result.missingData).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "forecastYears", severity: "high" }),
    ]));
  });

  it("rejects custom discount rates that do not exceed terminal growth", () => {
    const result = computeDcfRange({
      ...durableCompounderInput,
      dcfAssumptions: {
        discountRate: 0.03,
        terminalGrowthRate: 0.04,
      },
    });

    expect(result.status).toBe("unavailable");
    expect(result.missingData).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "discountRate", severity: "high" }),
    ]));
  });

  it("throws a deterministic validation error for invalid low-level DCF assumptions", () => {
    expect(() => computeDiscountedCashFlow({
      baseFreeCashFlow: 100,
      forecastYears: 5,
      discountRate: 0.05,
      terminalGrowthRate: 0.05,
      fcfGrowthRates: [0.1],
      netDebt: 0,
      sharesOutstanding: 0,
    })).toThrow(RangeError);
  });

  it("rejects low-level DCF growth lists shorter than the forecast horizon", () => {
    expect(() => computeDiscountedCashFlow({
      baseFreeCashFlow: 100,
      forecastYears: 5,
      discountRate: 0.1,
      terminalGrowthRate: 0.02,
      fcfGrowthRates: [0.08, 0.06],
      netDebt: 0,
      sharesOutstanding: 10,
    })).toThrow(RangeError);
  });
});


it("uses an explicit discount-rate override without requiring an unused market-value WACC", () => {
  const result = computeDcfRange({
    ...durableCompounderInput,
    analysisDate: "2026-08-26T12:00:00.000Z",
    market: { price: 30, currency: "USD" },
    dcfAssumptions: {
      baseFreeCashFlow: 250,
      sharesOutstanding: 100,
      netDebt: 40,
      discountRate: 0.09,
      terminalGrowthRate: 0.02,
      forecastYears: 5,
      fcfGrowthRates: [0.08, 0.06, 0.05, 0.04, 0.03],
    },
  });

  expect(result.status).toBe("available");
  expect(result.scenarios[1].assumptions.discountRate).toBe(0.09);
  expect(result.missingData).not.toEqual(expect.arrayContaining([
    expect.objectContaining({ field: "wacc" }),
  ]));
});

it("normalizes minor-unit quote prices to economic currency before DCF comparison", () => {
  const result = computeDcfRange({
    ...durableCompounderInput,
    company: { ...durableCompounderInput.company, currency: "GBP", reportingCurrency: "GBP", tradingCurrency: "GBp" },
    annualPeriods: durableCompounderInput.annualPeriods.map((period) => ({ ...period, currency: "GBP" })),
    market: {
      ...durableCompounderInput.market,
      price: 1500, currency: "GBp", marketCapCurrency: "GBP",
      marketCap: 1500, sharesOutstanding: 100,
    },
    dcfAssumptions: {
      baseFreeCashFlow: 100, sharesOutstanding: 100, netDebt: 0, discountRate: 0.10,
      terminalGrowthRate: 0.02, forecastYears: 5, fcfGrowthRates: [0, 0, 0, 0, 0],
    },
  });
  expect(result.status).toBe("available");
  expect(result.currency).toBe("GBP");
  expect(result.currentPrice).toBe(15);
  expect(result.impliedUpside).toBeCloseTo((result.mid as number) / 15 - 1, 10);
});
