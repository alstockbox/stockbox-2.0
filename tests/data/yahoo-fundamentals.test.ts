import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CompanySearchResult } from "../../src/lib/analysis/types";
import { fetchYahooFundamentalsResult, yahooCompanySearchProvider, yahooSymbolForCompany } from "../../src/lib/data/yahoo-fundamentals";

const company: CompanySearchResult = {
  ticker: "VOLV-B.ST",
  canonicalTicker: "VOLV-B.ST",
  name: "AB Volvo B",
  exchange: "STO",
  country: "SE",
  currency: "SEK",
  securityType: "Common Stock",
};

type Row = {
  asOfDate: string;
  periodType: string;
  currencyCode: string;
  reportedValue: { raw: number; fmt: string };
};

function series(type: string, rows: Row[]) {
  return { meta: { symbol: ["VOLV-B.ST"], type: [type] }, [type]: rows };
}
const annual = (date: string, value: number): Row => ({
  asOfDate: date,
  periodType: "12M",
  currencyCode: "SEK",
  reportedValue: { raw: value, fmt: String(value) },
});
const trailing = (value: number): Row => ({
  asOfDate: "2026-06-30",
  periodType: "TTM",
  currencyCode: "SEK",
  reportedValue: { raw: value, fmt: String(value) },
});
const quarter = (value: number): Row => ({
  asOfDate: "2026-06-30",
  periodType: "3M",
  currencyCode: "SEK",
  reportedValue: { raw: value, fmt: String(value) },
});

const timeseriesPayload = {
  timeseries: {
    result: [
      series("annualTotalRevenue", [annual("2024-12-31", 526_800), annual("2025-12-31", 479_183)]),
      series("annualGrossProfit", [annual("2024-12-31", 123_000), annual("2025-12-31", 116_869)]),
      series("annualOperatingIncome", [annual("2024-12-31", 56_000), annual("2025-12-31", 49_476)]),
      series("annualNetIncome", [annual("2024-12-31", 42_000), annual("2025-12-31", 34_456)]),
      series("annualOperatingCashFlow", [annual("2024-12-31", 48_000), annual("2025-12-31", 45_595)]),
      series("annualCapitalExpenditure", [annual("2024-12-31", -24_000), annual("2025-12-31", -26_130)]),
      series("annualTotalAssets", [annual("2024-12-31", 620_000), annual("2025-12-31", 648_590)]),
      series("annualTotalLiabilitiesNetMinorityInterest", [annual("2024-12-31", 450_000), annual("2025-12-31", 470_112)]),
      series("annualStockholdersEquity", [annual("2024-12-31", 170_000), annual("2025-12-31", 178_395)]),
      series("annualCashAndCashEquivalents", [annual("2024-12-31", 61_000), annual("2025-12-31", 64_761)]),
      series("annualTotalDebt", [annual("2024-12-31", 230_000), annual("2025-12-31", 247_001)]),
      series("annualCurrentAssets", [annual("2024-12-31", 290_000), annual("2025-12-31", 305_570)]),
      series("annualCurrentLiabilities", [annual("2024-12-31", 250_000), annual("2025-12-31", 265_914)]),
      series("annualInterestExpense", [annual("2024-12-31", 1_700), annual("2025-12-31", 1_832)]),
      series("annualDilutedEPS", [annual("2024-12-31", 20.1), annual("2025-12-31", 16.94)]),
      series("annualDilutedAverageShares", [annual("2024-12-31", 2_033), annual("2025-12-31", 2_033)]),
      series("annualOrdinarySharesNumber", [annual("2025-12-31", 2_033)]),
      series("trailingTotalRevenue", [trailing(471_534)]),
      series("trailingGrossProfit", [trailing(119_488)]),
      series("trailingOperatingIncome", [trailing(49_957)]),
      series("trailingNetIncome", [trailing(35_840)]),
      series("trailingOperatingCashFlow", [trailing(49_840)]),
      series("trailingCapitalExpenditure", [trailing(-26_551)]),
      series("trailingDilutedEPS", [trailing(17.62)]),
      series("trailingMarketCap", [trailing(697_067)]),
      series("quarterlyTotalAssets", [quarter(678_690)]),
      series("quarterlyTotalLiabilitiesNetMinorityInterest", [quarter(502_118)]),
      series("quarterlyStockholdersEquity", [quarter(176_572)]),
      series("quarterlyCashAndCashEquivalents", [quarter(46_971)]),
      series("quarterlyTotalDebt", [quarter(260_355)]),
      series("quarterlyCurrentAssets", [quarter(309_890)]),
      series("quarterlyCurrentLiabilities", [quarter(280_945)]),
      series("quarterlyOrdinarySharesNumber", [quarter(2_033)]),
    ],
  },
};

const metadataPayload = {
  quotes: [{ symbol: "VOLV-B.ST", sector: "Industrials", industry: "Farm & Heavy Construction Machinery", longname: "AB Volvo (publ)" }],
};
describe("Yahoo global fundamentals adapter", () => {
  it("prefers the verified canonical exchange ticker over provider aliases", () => {
    expect(yahooSymbolForCompany({ ...company, providerTickers: ["VOLV.B.ST", "VOLV-B.ST", "VOLVB.ST"] })).toBe("VOLV-B.ST");
    expect(yahooSymbolForCompany({ ...company, country: "US", canonicalTicker: "BRK.B", ticker: "BRK.B", providerTickers: [] })).toBe("BRK-B");
  });
  it("maps exact global Yahoo listings into searchable provider results", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ quotes: [{
      symbol: "BMW.DE", quoteType: "EQUITY", longname: "Bayerische Motoren Werke Aktiengesellschaft",
      exchDisp: "XETRA", country: "Germany", currency: "EUR",
    }] }), { status: 200, headers: { "Content-Type": "application/json" } })));
    const result = await yahooCompanySearchProvider.search("BMW.DE");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data[0]).toEqual(expect.objectContaining({
      canonicalTicker: "BMW.DE", country: "Germany", currency: "EUR",
      providerCapabilities: expect.objectContaining({ fundamentals: true, marketData: true }),
    }));
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      const payload = url.includes("fundamentals-timeseries") ? timeseriesPayload : metadataPayload;
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }));
  });

  it("builds verified local-currency TTM and annual periods without SEC", async () => {
    const result = await fetchYahooFundamentalsResult(company);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.analysisArchetype).toBe("standard");
    expect(result.data.trailingTwelveMonths).toEqual(expect.objectContaining({
      periodEndDate: "2026-06-30",
      balanceSheetDate: "2026-06-30",
      currency: "SEK",
      revenue: 471_534,
      operatingIncome: 49_957,
      netIncome: 35_840,
      operatingCashFlow: 49_840,
      capitalExpenditures: 26_551,
      currentSharesOutstanding: 2_033,
      totalAssets: 678_690,
    }));
    expect(result.data.annualPeriods).toHaveLength(2);
    expect(result.data.annualPeriods?.at(-1)).toEqual(expect.objectContaining({
      periodEndDate: "2025-12-31",
      revenue: 479_183,
      capitalExpenditures: 26_130,
      sharesDiluted: 2_033,
      currentSharesOutstanding: 2_033,
    }));
    expect(result.data.trailingTwelveMonths?.provenance?.revenue).toEqual(expect.objectContaining({
      provider: "yahoo-fundamentals",
      concept: "trailingTotalRevenue",
      periodEnd: "2026-06-30",
      unit: "SEK",
      valueKind: "reported",
    }));
  });

  it("never substitutes diluted average shares for current ordinary shares", async () => {
    const stripped = structuredClone(timeseriesPayload);
    stripped.timeseries.result = stripped.timeseries.result.filter((item) => item.meta.type[0] !== "quarterlyOrdinarySharesNumber" && item.meta.type[0] !== "annualOrdinarySharesNumber");
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => new Response(JSON.stringify(
      String(input).includes("fundamentals-timeseries") ? stripped : metadataPayload
    ), { status: 200, headers: { "Content-Type": "application/json" } })));
    const result = await fetchYahooFundamentalsResult(company);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.trailingTwelveMonths?.currentSharesOutstanding).toBeNull();
    expect(result.data.annualPeriods?.at(-1)?.sharesDiluted).toBe(2_033);
  });
});
