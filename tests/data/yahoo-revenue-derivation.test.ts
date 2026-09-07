import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CompanySearchResult } from "../../src/lib/analysis/types";
import { fetchYahooFundamentalsResult } from "../../src/lib/data/yahoo-fundamentals";

const company: CompanySearchResult = {
  ticker: "TEST.HE",
  canonicalTicker: "TEST.HE",
  name: "Test Company",
  exchange: "Helsinki",
  country: "Finland",
  currency: "EUR",
  securityType: "Common Stock",
};

type FactInput = {
  type: string;
  value: number;
  date?: string;
  currency?: string | null;
  periodType?: string;
};

function series(fact: FactInput) {
  const type = fact.type;
  const currencyCode = fact.currency === null ? undefined : fact.currency ?? "EUR";
  return {
    meta: { symbol: ["TEST.HE"], type: [type] },
    [type]: [{
      asOfDate: fact.date ?? "2025-12-31",
      periodType: fact.periodType ?? "12M",
      ...(currencyCode ? { currencyCode } : {}),
      reportedValue: { raw: fact.value, fmt: String(fact.value) },
    }],
  };
}

function timeseriesPayload(facts: FactInput[]) {
  const anchors: FactInput[] = [
    { type: "annualNetIncome", value: 80 },
    { type: "annualTotalAssets", value: 2_000 },
  ];
  return {
    timeseries: {
      result: [...anchors, ...facts].map(series),
    },
  };
}

function installYahooMock(facts: FactInput[]) {
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes("/ws/fundamentals-timeseries/")) {
      const requestedTypes = new Set(new URL(url).searchParams.get("type")?.split(",") ?? []);
      const requestedFacts = facts.filter((fact) => requestedTypes.has(fact.type));
      return new Response(JSON.stringify(timeseriesPayload(requestedFacts)), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.includes("/v1/finance/search")) {
      return new Response(JSON.stringify({
        quotes: [{
          symbol: "TEST.HE",
          quoteType: "EQUITY",
          longname: "Test Company",
          exchDisp: "Helsinki",
          country: "Finland",
          currency: "EUR",
          sector: "Industrials",
          industry: "Engineering & Construction",
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

describe("Yahoo revenue derivation semantics", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("derives revenue as same-period GrossProfit plus CostOfRevenue when TotalRevenue is unavailable", async () => {
    const period = await latestAnnual([
      { type: "annualGrossProfit", value: 722_000 },
      { type: "annualCostOfRevenue", value: 1_235_000 },
    ]);

    expect(period.revenue).toBe(1_957_000);
    expect(period.provenance?.revenue).toMatchObject({
      provider: "yahoo-fundamentals",
      unit: "EUR",
      periodEnd: "2025-12-31",
      periodBasis: "FY",
      valueKind: "derived",
    });
    expect(period.provenance?.revenue?.inputs).toEqual([
      "annualGrossProfit",
      "annualCostOfRevenue",
    ]);
    expect(period.provenance?.revenue?.note).toContain("GrossProfit plus CostOfRevenue");
  });

  it("preserves valid zero revenue when negative gross profit exactly offsets cost of revenue", async () => {
    const period = await latestAnnual([
      { type: "annualGrossProfit", value: -100 },
      { type: "annualCostOfRevenue", value: 100 },
    ]);

    expect(period.revenue).toBe(0);
    expect(period.provenance?.revenue?.valueKind).toBe("derived");
  });

  it("keeps direct TotalRevenue authoritative over component-derived revenue", async () => {
    const period = await latestAnnual([
      { type: "annualTotalRevenue", value: 2_000_000 },
      { type: "annualGrossProfit", value: 722_000 },
      { type: "annualCostOfRevenue", value: 1_235_000 },
    ]);

    expect(period.revenue).toBe(2_000_000);
    expect(period.provenance?.revenue).toMatchObject({
      concept: "annualTotalRevenue",
      valueKind: "reported",
    });
  });

  it("fails closed when GrossProfit and CostOfRevenue use different currencies", async () => {
    const period = await latestAnnual([
      { type: "annualGrossProfit", value: 722_000, currency: "EUR" },
      { type: "annualCostOfRevenue", value: 1_235_000, currency: "USD" },
    ]);

    expect(period.revenue).toBeNull();
    expect(period.provenance?.revenue).toBeUndefined();
  });

  it("fails closed when either component lacks a currency", async () => {
    const period = await latestAnnual([
      { type: "annualGrossProfit", value: 722_000, currency: "EUR" },
      { type: "annualCostOfRevenue", value: 1_235_000, currency: null },
    ]);

    expect(period.revenue).toBeNull();
    expect(period.provenance?.revenue).toBeUndefined();
  });

  it("fails closed when the components do not share the selected period date", async () => {
    const period = await latestAnnual([
      { type: "annualGrossProfit", value: 722_000 },
      { type: "annualCostOfRevenue", value: 1_235_000, date: "2025-12-30" },
    ]);

    expect(period.revenue).toBeNull();
    expect(period.provenance?.revenue).toBeUndefined();
  });

  it("fails closed when a component has a different period type", async () => {
    const period = await latestAnnual([
      { type: "annualGrossProfit", value: 722_000, periodType: "12M" },
      { type: "annualCostOfRevenue", value: 1_235_000, periodType: "TTM" },
    ]);

    expect(period.revenue).toBeNull();
    expect(period.provenance?.revenue).toBeUndefined();
  });
});
