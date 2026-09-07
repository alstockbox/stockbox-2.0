import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CompanySearchResult } from "../../src/lib/analysis/types";
import { fetchYahooFundamentalsResult } from "../../src/lib/data/yahoo-fundamentals";

const company: CompanySearchResult = {
  ticker: "TEST.LS",
  canonicalTicker: "TEST.LS",
  name: "Test Company",
  exchange: "Lisbon",
  country: "Portugal",
  currency: "EUR",
  securityType: "Common Stock",
};

type Row = {
  asOfDate: string;
  periodType: string;
  currencyCode?: string;
  reportedValue: { raw: number; fmt: string };
};

function row(date: string, value: number, currency = "EUR"): Row {
  return {
    asOfDate: date,
    periodType: "12M",
    currencyCode: currency,
    reportedValue: { raw: value, fmt: String(value) },
  };
}

function series(type: string, rows: Row[]) {
  return { meta: { symbol: ["TEST.LS"], type: [type] }, [type]: rows };
}

const dates = ["2022-12-31", "2023-12-31", "2024-12-31", "2025-12-31"] as const;

function payload(options?: {
  directEps?: Array<[string, number]>;
  dilutedIncome?: Array<[string, number]>;
  dilutedShares?: Array<[string, number]>;
}) {
  const directEps = options?.directEps ?? [
    ["2022-12-31", 0.08],
    ["2023-12-31", 0.12],
    ["2024-12-31", 0.16],
  ];
  const dilutedIncome = options?.dilutedIncome ?? dates.map((date, index) => [date, (index + 2) * 4_000_000] as [string, number]);
  const dilutedShares = options?.dilutedShares ?? dates.map((date) => [date, 100_000_000] as [string, number]);
  return {
    timeseries: {
      result: [
        series("annualTotalRevenue", dates.map((date, index) => row(date, 100_000_000 + index * 10_000_000))),
        series("annualNetIncome", dates.map((date, index) => row(date, 7_000_000 + index * 2_000_000))),
        series("annualTotalAssets", dates.map((date, index) => row(date, 200_000_000 + index * 10_000_000))),
        series("annualDilutedNIAvailtoComStockholders", dilutedIncome.map(([date, value]) => row(date, value))),
        series("annualDilutedAverageShares", dilutedShares.map(([date, value]) => row(date, value))),
        series("annualDilutedEPS", directEps.map(([date, value]) => row(date, value))),
      ],
    },
  };
}

function installMock(timeseriesPayload: ReturnType<typeof payload>) {
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes("/ws/fundamentals-timeseries/")) {
      return new Response(JSON.stringify(timeseriesPayload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.includes("/v1/finance/search")) {
      return new Response(JSON.stringify({
        quotes: [{
          symbol: "TEST.LS",
          quoteType: "EQUITY",
          longname: "Test Company",
          exchDisp: "Lisbon",
          country: "Portugal",
          currency: "EUR",
          sector: "Industrials",
          industry: "Industrial Distribution",
        }],
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    throw new Error(`Unexpected Yahoo request: ${url}`);
  }));
}

async function annualPeriods(timeseriesPayload: ReturnType<typeof payload>) {
  installMock(timeseriesPayload);
  const result = await fetchYahooFundamentalsResult(company);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.message);
  return result.data.annualPeriods ?? [];
}

describe("Yahoo diluted EPS derivation", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("derives missing annual diluted EPS only after historical Yahoo facts reconcile", async () => {
    const periods = await annualPeriods(payload());
    const latest = periods.at(-1);

    expect(latest?.epsDiluted).toBeCloseTo(0.2, 12);
    expect(latest?.provenance?.epsDiluted).toMatchObject({
      source: "Yahoo Finance fundamentals timeseries",
      provider: "yahoo-fundamentals",
      unit: "EUR",
      periodEnd: "2025-12-31",
      periodBasis: "FY",
      valueKind: "derived",
      inputs: expect.arrayContaining([
        "annualDilutedNIAvailtoComStockholders",
        "annualDilutedAverageShares",
      ]),
    });
  });

  it("does not derive when recent historical direct EPS materially disagrees with diluted income per share", async () => {
    const periods = await annualPeriods(payload({
      directEps: [
        ["2022-12-31", 0.08],
        ["2023-12-31", 0.12],
        ["2024-12-31", 0.50],
      ],
    }));

    expect(periods.at(-1)?.epsDiluted).toBeNull();
    expect(periods.at(-1)?.provenance?.epsDiluted).toBeUndefined();
  });

  it("requires at least two historical reconciliation points before deriving", async () => {
    const periods = await annualPeriods(payload({ directEps: [["2024-12-31", 0.16]] }));

    expect(periods.at(-1)?.epsDiluted).toBeNull();
    expect(periods.at(-1)?.provenance?.epsDiluted).toBeUndefined();
  });

  it("keeps direct annual diluted EPS authoritative", async () => {
    const periods = await annualPeriods(payload({
      directEps: [
        ["2022-12-31", 0.08],
        ["2023-12-31", 0.12],
        ["2024-12-31", 0.16],
        ["2025-12-31", 0.25],
      ],
    }));
    const latest = periods.at(-1);

    expect(latest?.epsDiluted).toBe(0.25);
    expect(latest?.provenance?.epsDiluted).toMatchObject({
      concept: "annualDilutedEPS",
      periodEnd: "2025-12-31",
      periodBasis: "FY",
      valueKind: "reported",
    });
  });
});
