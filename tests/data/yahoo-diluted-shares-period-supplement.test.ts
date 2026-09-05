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

type Row = {
  asOfDate: string;
  periodType: string;
  currencyCode?: string;
  reportedValue: { raw: number; fmt: string };
};

function row(date: string, periodType: string, value: number): Row {
  return {
    asOfDate: date,
    periodType,
    currencyCode: "AUD",
    reportedValue: { raw: value, fmt: String(value) },
  };
}

function series(type: string, rows: Row[]) {
  return { meta: { symbol: ["TEST.AX"], type: [type] }, [type]: rows };
}

function payload(extra: Array<ReturnType<typeof series>>) {
  return {
    timeseries: {
      result: [
        series("annualTotalRevenue", [row("2024-12-31", "12M", 900), row("2025-12-31", "12M", 1_000)]),
        series("annualNetIncome", [row("2024-12-31", "12M", 80), row("2025-12-31", "12M", 90)]),
        series("annualTotalAssets", [row("2024-12-31", "12M", 1_800), row("2025-12-31", "12M", 2_000)]),
        ...extra,
      ],
    },
  };
}

function installMock(extra: Array<ReturnType<typeof series>>) {
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes("/ws/fundamentals-timeseries/")) {
      return new Response(JSON.stringify(payload(extra)), {
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
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    throw new Error(`Unexpected Yahoo request: ${url}`);
  }));
}

async function annualPeriods(extra: Array<ReturnType<typeof series>>) {
  installMock(extra);
  const result = await fetchYahooFundamentalsResult(company);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.message);
  return result.data.annualPeriods ?? [];
}

describe("Yahoo diluted-share annual period supplement", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("uses exact-date trailing diluted average shares when the annual concept is missing", async () => {
    const periods = await annualPeriods([
      series("annualDilutedAverageShares", [row("2024-12-31", "12M", 100)]),
      series("trailingDilutedAverageShares", [
        row("2024-12-31", "TTM", 101),
        row("2025-12-31", "TTM", 110),
      ]),
    ]);

    expect(periods.at(-2)?.sharesDiluted).toBe(100);
    expect(periods.at(-1)?.sharesDiluted).toBe(110);
    expect(periods.at(-1)?.provenance?.sharesDiluted).toMatchObject({
      concept: "trailingDilutedAverageShares",
      provider: "yahoo-fundamentals",
      periodEnd: "2025-12-31",
      periodBasis: "TTM_REPORTED",
      valueKind: "reported",
    });
  });

  it("does not borrow diluted shares from a different trailing period", async () => {
    const periods = await annualPeriods([
      series("annualDilutedAverageShares", [row("2024-12-31", "12M", 100)]),
      series("trailingDilutedAverageShares", [row("2025-09-30", "TTM", 110)]),
    ]);

    expect(periods.at(-1)?.sharesDiluted).toBeNull();
    expect(periods.at(-1)?.provenance?.sharesDiluted).toBeUndefined();
  });

  it("keeps the direct annual diluted-share fact authoritative", async () => {
    const periods = await annualPeriods([
      series("annualDilutedAverageShares", [
        row("2024-12-31", "12M", 100),
        row("2025-12-31", "12M", 108),
      ]),
      series("trailingDilutedAverageShares", [row("2025-12-31", "TTM", 110)]),
    ]);

    expect(periods.at(-1)?.sharesDiluted).toBe(108);
    expect(periods.at(-1)?.provenance?.sharesDiluted).toMatchObject({
      concept: "annualDilutedAverageShares",
      periodBasis: "FY",
      valueKind: "reported",
    });
  });
});
