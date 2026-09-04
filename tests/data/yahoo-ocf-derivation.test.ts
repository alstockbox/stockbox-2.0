import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CompanySearchResult } from "../../src/lib/analysis/types";
import { fetchYahooFundamentalsResult } from "../../src/lib/data/yahoo-fundamentals";

const company: CompanySearchResult = {
  ticker: "TEST.AX",
  canonicalTicker: "TEST.AX",
  name: "Test Company",
  exchange: "Australian",
  country: "Australia",
  currency: "AUD",
  securityType: "Common Stock",
};

type FactInput = {
  type: string;
  value: number;
  currency?: string;
};

function series(type: string, value: number, currency = "AUD") {
  return {
    meta: { symbol: ["TEST.AX"], type: [type] },
    [type]: [{
      asOfDate: "2025-12-31",
      periodType: "12M",
      currencyCode: currency,
      reportedValue: { raw: value, fmt: String(value) },
    }],
  };
}

function timeseriesPayload(facts: FactInput[]) {
  const anchors = [
    { type: "annualTotalRevenue", value: 1_000, currency: "AUD" },
    { type: "annualNetIncome", value: 80, currency: "AUD" },
    { type: "annualTotalAssets", value: 2_000, currency: "AUD" },
  ];
  return {
    timeseries: {
      result: [...anchors, ...facts].map((fact) => series(fact.type, fact.value, fact.currency ?? "AUD")),
    },
  };
}

function installYahooMock(facts: FactInput[]) {
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes("/ws/fundamentals-timeseries/")) {
      return new Response(JSON.stringify(timeseriesPayload(facts)), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.includes("/v1/finance/search")) {
      return new Response(JSON.stringify({
        quotes: [{
          symbol: "TEST.AX",
          quoteType: "EQUITY",
          longname: "Test Company",
          exchDisp: "Australian",
          country: "Australia",
          currency: "AUD",
          sector: "Industrials",
          industry: "Industrial Distribution",
        }],
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    throw new Error(`Unexpected Yahoo request: ${url}`);
  }));
}

async function latestAnnual(facts: FactInput[]) {
  installYahooMock(facts);
  const result = await fetchYahooFundamentalsResult(company);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.message);
  const period = result.data.annualPeriods?.at(-1);
  expect(period).toBeDefined();
  if (!period) throw new Error("Expected annual period");
  return period;
}

describe("Yahoo OCF derivation and capex semantics", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("uses Yahoo CapitalExpenditure and derives missing OCF from same-period reported FCF", async () => {
    const period = await latestAnnual([
      { type: "annualFreeCashFlow", value: 100 },
      { type: "annualCapitalExpenditure", value: -40 },
      { type: "annualPurchaseOfPPE", value: -25 },
    ]);

    expect(period.capitalExpenditures).toBe(40);
    expect(period.freeCashFlow).toBe(100);
    expect(period.operatingCashFlow).toBe(140);
    expect(period.operatingCashFlow! - period.capitalExpenditures!).toBe(period.freeCashFlow);
    expect(period.provenance?.capitalExpenditures).toMatchObject({
      concept: "annualCapitalExpenditure",
      valueKind: "reported",
    });
    expect(period.provenance?.operatingCashFlow).toMatchObject({
      provider: "yahoo-fundamentals",
      valueKind: "derived",
      inputs: ["annualFreeCashFlow", "annualCapitalExpenditure"],
      periodEnd: "2025-12-31",
      unit: "AUD",
    });
    expect(period.provenance?.operatingCashFlow?.note).toContain("FreeCashFlow");
  });

  it("keeps directly reported OCF authoritative when Yahoo provides it", async () => {
    const period = await latestAnnual([
      { type: "annualOperatingCashFlow", value: 150 },
      { type: "annualFreeCashFlow", value: 100 },
      { type: "annualCapitalExpenditure", value: -40 },
      { type: "annualPurchaseOfPPE", value: -25 },
    ]);

    expect(period.operatingCashFlow).toBe(150);
    expect(period.capitalExpenditures).toBe(40);
    expect(period.provenance?.operatingCashFlow).toMatchObject({
      concept: "annualOperatingCashFlow",
      valueKind: "reported",
    });
  });

  it("does not derive OCF when FCF and CapitalExpenditure currencies differ", async () => {
    const period = await latestAnnual([
      { type: "annualFreeCashFlow", value: 100, currency: "AUD" },
      { type: "annualCapitalExpenditure", value: -40, currency: "USD" },
      { type: "annualPurchaseOfPPE", value: -25, currency: "AUD" },
    ]);

    expect(period.capitalExpenditures).toBe(40);
    expect(period.operatingCashFlow).toBeNull();
    expect(period.provenance?.operatingCashFlow).toBeUndefined();
  });

  it("does not use PurchaseOfPPE alone to manufacture OCF", async () => {
    const period = await latestAnnual([
      { type: "annualFreeCashFlow", value: 100 },
      { type: "annualPurchaseOfPPE", value: -25 },
    ]);

    expect(period.capitalExpenditures).toBe(25);
    expect(period.provenance?.capitalExpenditures).toMatchObject({ concept: "annualPurchaseOfPPE" });
    expect(period.operatingCashFlow).toBeNull();
    expect(period.provenance?.operatingCashFlow).toBeUndefined();
  });
});
