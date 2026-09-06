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
  date?: string;
  currency?: string;
};

function series(type: string, value: number, date = "2025-12-31", currency = "AUD") {
  return {
    meta: { symbol: ["TEST.AX"], type: [type] },
    [type]: [{
      asOfDate: date,
      periodType: "12M",
      currencyCode: currency,
      reportedValue: { raw: value, fmt: String(value) },
    }],
  };
}

function timeseriesPayload(facts: FactInput[]) {
  const anchors: FactInput[] = [
    { type: "annualTotalRevenue", value: 1_000 },
    { type: "annualNetIncome", value: 80 },
    { type: "annualTotalAssets", value: 2_000 },
  ];
  return {
    timeseries: {
      result: [...anchors, ...facts].map((fact) => series(
        fact.type,
        fact.value,
        fact.date ?? "2025-12-31",
        fact.currency ?? "AUD",
      )),
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

describe("Yahoo interest expense semantics", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("uses InterestExpenseNonOperating as a reported fallback when InterestExpense is unavailable", async () => {
    const period = await latestAnnual([
      { type: "annualInterestExpenseNonOperating", value: 42 },
    ]);

    expect(period.interestExpense).toBe(42);
    expect(period.provenance?.interestExpense).toMatchObject({
      provider: "yahoo-fundamentals",
      concept: "annualInterestExpenseNonOperating",
      valueKind: "reported",
      periodEnd: "2025-12-31",
      unit: "AUD",
    });
  });
});
