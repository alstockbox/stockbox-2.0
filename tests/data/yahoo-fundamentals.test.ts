import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CompanySearchResult } from "../../src/lib/analysis/types";
import { fetchYahooFundamentalsResult, yahooCompanySearchProvider, yahooSymbolForCompany } from "../../src/lib/data/yahoo-fundamentals";
import { resetYahooMarketProviderStateForTests, yahooMarketDataProvider } from "../../src/lib/data/yahoo-market";

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

  it("keeps Yahoo ADR search results discovery-only until ADR fundamentals are supported", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ quotes: [{
      symbol: "NVO", quoteType: "EQUITY", longname: "Novo Nordisk A/S ADR",
      exchDisp: "NYSE", country: "US", currency: "USD",
    }] }), { status: 200, headers: { "Content-Type": "application/json" } })));
    const result = await yahooCompanySearchProvider.search("NVO");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data[0]).toEqual(expect.objectContaining({
      ticker: "NVO",
      securityType: "ADR",
      providerCapabilities: expect.objectContaining({ fundamentals: false, marketData: true }),
    }));
  });

  it.each([
    ["PETR4.SA", "Petróleo Brasileiro S.A. - Petrobras", "Preferred"],
    ["FEMSAUBD.MX", "Fomento Económico Mexicano, S.A.B. de C.V.", "Other"],
  ] as const)("keeps structurally non-common global listings discovery-only: %s", async (symbol, longname, securityType) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ quotes: [{
      symbol, quoteType: "EQUITY", longname, exchDisp: "Global", currency: "USD",
    }] }), { status: 200, headers: { "Content-Type": "application/json" } })));
    const result = await yahooCompanySearchProvider.search(symbol);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data[0]).toEqual(expect.objectContaining({
      ticker: symbol,
      securityType,
      providerCapabilities: expect.objectContaining({ fundamentals: false, marketData: true }),
    }));
  });

  it("keeps Yahoo preferred depositary-share results discovery-only", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ quotes: [{
      symbol: "JPM-PD", quoteType: "EQUITY", longname: "JPMorgan Chase & Co. Depositary Shares Series DD",
      exchDisp: "NYSE", country: "US", currency: "USD",
    }] }), { status: 200, headers: { "Content-Type": "application/json" } })));
    const result = await yahooCompanySearchProvider.search("JPM-PD");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data[0]).toEqual(expect.objectContaining({
      ticker: "JPM-PD",
      securityType: "Preferred",
      providerCapabilities: expect.objectContaining({ fundamentals: false, marketData: true }),
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

  it("uses the known company name for classification when Yahoo metadata is empty", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const payload = String(input).includes("fundamentals-timeseries") ? timeseriesPayload : { quotes: [] };
      return new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } });
    }));
    const result = await fetchYahooFundamentalsResult({ ...company, name: "Eurobattery Minerals" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.analysisArchetype).toBe("cyclical");
  });

  it("uses a listed-security sector hint when Yahoo sector metadata is empty", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const payload = String(input).includes("fundamentals-timeseries") ? timeseriesPayload : { quotes: [] };
      return new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } });
    }));
    const result = await fetchYahooFundamentalsResult({ ...company, name: "Mavshack", sectorHint: "Consumer Discretionary" } as typeof company & { sectorHint: string });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toEqual(expect.objectContaining({ sector: "consumer", analysisArchetype: "standard" }));
  });

  it("fails over Yahoo metadata search to query2 when query1 is rate limited", async () => {
    const requested: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      requested.push(url);
      if (url.includes("query1.finance.yahoo.com/v1/finance/search")) {
        return new Response("Too Many Requests", { status: 429, headers: { "Content-Type": "text/plain" } });
      }
      const payload = url.includes("fundamentals-timeseries") ? timeseriesPayload : metadataPayload;
      return new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } });
    }));
    const result = await fetchYahooFundamentalsResult(company);
    expect(result.ok).toBe(true);
    expect(requested.some((url) => url.includes("query2.finance.yahoo.com/v1/finance/search"))).toBe(true);
  });

  it("fails over Yahoo fundamentals timeseries from query2 to query1 when query2 is rate limited", async () => {
    const requested: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = String(input); requested.push(url);
      if (url.includes("fundamentals-timeseries") && url.includes("query2.finance.yahoo.com")) return new Response("rate limited", { status: 429, headers: { "Content-Type": "text/plain" } });
      const payload = url.includes("fundamentals-timeseries") ? timeseriesPayload : metadataPayload;
      return new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } });
    }));
    const result = await fetchYahooFundamentalsResult(company);
    expect(result.ok).toBe(true);
    expect(requested.some((url) => url.includes("query1.finance.yahoo.com") && url.includes("fundamentals-timeseries"))).toBe(true);
  });

  it("serializes Yahoo fundamentals and chart transport across providers", async () => {
    const chartPayload = { chart: { result: [{ meta: { currency: "SEK", regularMarketPrice: 100 }, timestamp: [1_735_689_600, 1_735_776_000], indicators: { quote: [{ close: [99, 100], volume: [1000, 1000] }], adjclose: [{ adjclose: [99, 100] }] } }], error: null } };
    let active = 0; let maxActive = 0;
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      active += 1; maxActive = Math.max(maxActive, active); await new Promise((resolve) => setTimeout(resolve, 10)); active -= 1;
      const url = String(input); const payload = url.includes("fundamentals-timeseries") ? timeseriesPayload : url.includes("/v1/finance/search") ? metadataPayload : chartPayload;
      return new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } });
    }));
    resetYahooMarketProviderStateForTests();
    const [fundamentals, market] = await Promise.all([fetchYahooFundamentalsResult(company), yahooMarketDataProvider.fetchMarketData({ ticker: "TEST.ST", name: "Test" })]);
    expect(fundamentals.ok).toBe(true); expect(market.ok).toBe(true); expect(maxActive).toBe(1);
  });

  it("uses one stable Yahoo timeseries cache key throughout the same UTC day", async () => {
    vi.useFakeTimers();
    const requested: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      requested.push(url);
      const payload = url.includes("fundamentals-timeseries") ? timeseriesPayload : metadataPayload;
      return new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } });
    }));
    try {
      vi.setSystemTime(new Date("2026-08-27T01:00:00.000Z"));
      await fetchYahooFundamentalsResult(company);
      vi.setSystemTime(new Date("2026-08-27T22:00:00.000Z"));
      await fetchYahooFundamentalsResult(company);
      const timeseriesUrls = requested.filter((url) => url.includes("fundamentals-timeseries"));
      expect(timeseriesUrls).toHaveLength(2);
      expect(new URL(timeseriesUrls[0]).searchParams.get("period2")).toBe(new URL(timeseriesUrls[1]).searchParams.get("period2"));
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    ["Financial Services", "Asset Management", "investment_entity", 0.75],
    ["Real Estate", "Real Estate Services", "property_company", 0.7],
  ] as const)("preserves a specialist classification instead of replacing it with a generic sector fallback: %s / %s", async (sector, industry, archetype, minimumConfidence) => {
    const specialistMetadata = {
      quotes: [{ symbol: "VOLV-B.ST", sector, industry, longname: "Specialist Company" }],
    };
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => new Response(JSON.stringify(
      String(input).includes("fundamentals-timeseries") ? timeseriesPayload : specialistMetadata
    ), { status: 200, headers: { "Content-Type": "application/json" } })));

    const result = await fetchYahooFundamentalsResult(company);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.analysisArchetype).toBe(archetype);
    expect(result.data.classificationDiagnostics).toEqual(expect.objectContaining({
      ambiguous: false,
      confidence: expect.any(Number),
    }));
    expect(result.data.classificationDiagnostics?.confidence ?? 0).toBeGreaterThanOrEqual(minimumConfidence);
  });

  it("builds verified local-currency TTM and annual periods without SEC", async () => {
    const result = await fetchYahooFundamentalsResult(company);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.analysisArchetype).toBe("cyclical");
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

  it("builds a prior provider-reported TTM period with the matching prior balance sheet", async () => {
    const payload = structuredClone(timeseriesPayload);
    const priorTrailing = (value: number): Row => ({ ...trailing(value), asOfDate: "2025-06-30" });
    const priorQuarter = (value: number): Row => ({ ...quarter(value), asOfDate: "2025-06-30" });
    const addPrior = (type: string, row: Row) => {
      const item = payload.timeseries.result.find((result) => result.meta.type[0] === type);
      if (item) (item[type as keyof typeof item] as Row[]).unshift(row);
    };
    addPrior("trailingTotalRevenue", priorTrailing(450_000));
    addPrior("trailingGrossProfit", priorTrailing(110_000));
    addPrior("trailingOperatingIncome", priorTrailing(45_000));
    addPrior("trailingNetIncome", priorTrailing(31_000));
    addPrior("trailingOperatingCashFlow", priorTrailing(44_000));
    addPrior("trailingCapitalExpenditure", priorTrailing(-23_000));
    addPrior("quarterlyTotalAssets", priorQuarter(630_000));
    addPrior("quarterlyTotalLiabilitiesNetMinorityInterest", priorQuarter(460_000));
    addPrior("quarterlyStockholdersEquity", priorQuarter(170_000));
    addPrior("quarterlyCashAndCashEquivalents", priorQuarter(55_000));
    addPrior("quarterlyTotalDebt", priorQuarter(235_000));

    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => new Response(JSON.stringify(
      String(input).includes("fundamentals-timeseries") ? payload : metadataPayload
    ), { status: 200, headers: { "Content-Type": "application/json" } })));
    const result = await fetchYahooFundamentalsResult(company);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.priorTrailingTwelveMonths).toEqual(expect.objectContaining({
      periodBasis: "TTM_REPORTED",
      periodEndDate: "2025-06-30",
      balanceSheetDate: "2025-06-30",
      revenue: 450_000,
      operatingIncome: 45_000,
      netIncome: 31_000,
      totalAssets: 630_000,
      totalEquity: 170_000,
      totalDebt: 235_000,
      cashAndEquivalents: 55_000,
    }));
  });

  it("captures a prior comparable quarterly balance sheet even when Yahoo exposes only one TTM flow period", async () => {
    const payload = structuredClone(timeseriesPayload);
    const priorQuarter = (value: number): Row => ({ ...quarter(value), asOfDate: "2025-06-30" });
    for (const [type, value] of [
      ["quarterlyTotalAssets", 630_000],
      ["quarterlyTotalLiabilitiesNetMinorityInterest", 460_000],
      ["quarterlyStockholdersEquity", 170_000],
      ["quarterlyCashAndCashEquivalents", 55_000],
      ["quarterlyTotalDebt", 235_000],
    ] as const) {
      const item = payload.timeseries.result.find((result) => result.meta.type[0] === type);
      if (item) (item[type as keyof typeof item] as Row[]).unshift(priorQuarter(value));
    }
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => new Response(JSON.stringify(
      String(input).includes("fundamentals-timeseries") ? payload : metadataPayload
    ), { status: 200, headers: { "Content-Type": "application/json" } })));

    const result = await fetchYahooFundamentalsResult(company);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.priorTrailingTwelveMonths).toBeUndefined();
    expect(result.data.priorComparableBalanceSheet).toEqual(expect.objectContaining({
      periodEndDate: "2025-06-30",
      balanceSheetDate: "2025-06-30",
      currency: "SEK",
      totalAssets: 630_000,
      totalLiabilities: 460_000,
      totalEquity: 170_000,
      totalDebt: 235_000,
      cashAndEquivalents: 55_000,
    }));
  });

  it("maps richer Yahoo cash-flow and balance-sheet concepts without inventing values", async () => {
    const payload = structuredClone(timeseriesPayload);
    payload.timeseries.result.push(
      series("annualFreeCashFlow", [annual("2024-12-31", 24_000), annual("2025-12-31", 19_000)]),
      series("trailingFreeCashFlow", [trailing(23_500)]),
      series("annualDepreciationAndAmortization", [annual("2024-12-31", 10_000), annual("2025-12-31", 11_500)]),
      series("trailingDepreciationAndAmortization", [trailing(12_000)]),
      series("annualAccountsReceivable", [annual("2024-12-31", 80_000), annual("2025-12-31", 84_000)]),
      series("quarterlyAccountsReceivable", [quarter(88_000)]),
      series("annualInventory", [annual("2024-12-31", 70_000), annual("2025-12-31", 74_000)]),
      series("quarterlyInventory", [quarter(77_000)]),
      series("annualCurrentDebt", [annual("2024-12-31", 30_000), annual("2025-12-31", 35_000)]),
      series("quarterlyCurrentDebt", [quarter(37_000)]),
      series("annualLongTermDebt", [annual("2024-12-31", 200_000), annual("2025-12-31", 212_000)]),
      series("quarterlyLongTermDebt", [quarter(223_000)]),
    );
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => new Response(JSON.stringify(
      String(input).includes("fundamentals-timeseries") ? payload : metadataPayload
    ), { status: 200, headers: { "Content-Type": "application/json" } })));

    const result = await fetchYahooFundamentalsResult(company);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.trailingTwelveMonths).toEqual(expect.objectContaining({
      freeCashFlow: 23_500,
      depreciationAndAmortization: 12_000,
      accountsReceivable: 88_000,
      inventory: 77_000,
      shortTermDebt: 37_000,
      longTermDebt: 223_000,
    }));
    expect(result.data.annualPeriods?.at(-1)).toEqual(expect.objectContaining({
      freeCashFlow: 19_000,
      depreciationAndAmortization: 11_500,
      accountsReceivable: 84_000,
      inventory: 74_000,
      shortTermDebt: 35_000,
      longTermDebt: 212_000,
    }));
  });

  it("prefers Yahoo PurchaseOfPPE for canonical cash capex when available", async () => {
    const payload = structuredClone(timeseriesPayload);
    payload.timeseries.result.push(
      series("annualPurchaseOfPPE", [annual("2024-12-31", -20_000), annual("2025-12-31", -21_000)]),
      series("trailingPurchaseOfPPE", [trailing(-22_000)]),
    );
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => new Response(JSON.stringify(
      String(input).includes("fundamentals-timeseries") ? payload : metadataPayload
    ), { status: 200, headers: { "Content-Type": "application/json" } })));
    const result = await fetchYahooFundamentalsResult(company);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.annualPeriods?.at(-1)?.capitalExpenditures).toBe(21_000);
    expect(result.data.trailingTwelveMonths?.capitalExpenditures).toBe(22_000);
    expect(result.data.annualPeriods?.at(-1)?.provenance?.capitalExpenditures?.concept).toBe("annualPurchaseOfPPE");
  });

  it("prefers consolidated Yahoo net income including noncontrolling interests", async () => {
    const payload = structuredClone(timeseriesPayload);
    payload.timeseries.result.push(
      series("annualNetIncomeIncludingNoncontrollingInterests", [annual("2024-12-31", 50_000), annual("2025-12-31", 44_000)]),
      series("trailingNetIncomeIncludingNoncontrollingInterests", [trailing(46_000)]),
    );
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => new Response(JSON.stringify(
      String(input).includes("fundamentals-timeseries") ? payload : metadataPayload
    ), { status: 200, headers: { "Content-Type": "application/json" } })));
    const result = await fetchYahooFundamentalsResult(company);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.annualPeriods?.at(-1)?.netIncome).toBe(44_000);
    expect(result.data.trailingTwelveMonths?.netIncome).toBe(46_000);
    expect(result.data.annualPeriods?.at(-1)?.provenance?.netIncome?.concept).toBe("annualNetIncomeIncludingNoncontrollingInterests");
  });

  it("prefers Yahoo operating income as reported over normalized OperatingIncome", async () => {
    const payload = structuredClone(timeseriesPayload);
    payload.timeseries.result.push(
      series("annualTotalOperatingIncomeAsReported", [annual("2024-12-31", 54_000), annual("2025-12-31", 47_000)]),
      series("trailingTotalOperatingIncomeAsReported", [trailing(48_000)]),
    );
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => new Response(JSON.stringify(
      String(input).includes("fundamentals-timeseries") ? payload : metadataPayload
    ), { status: 200, headers: { "Content-Type": "application/json" } })));

    const result = await fetchYahooFundamentalsResult(company);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.annualPeriods?.at(-1)?.operatingIncome).toBe(47_000);
    expect(result.data.trailingTwelveMonths?.operatingIncome).toBe(48_000);
    expect(result.data.annualPeriods?.at(-1)?.provenance?.operatingIncome?.concept).toBe("annualTotalOperatingIncomeAsReported");
    expect(result.data.trailingTwelveMonths?.provenance?.operatingIncome?.concept).toBe("trailingTotalOperatingIncomeAsReported");
  });

  it("derives minority interest from gross equity when Yahoo omits the quarterly minority-interest fact", async () => {
    const withGrossEquity = structuredClone(timeseriesPayload);
    const parentEquity = withGrossEquity.timeseries.result.find((item) => item.meta.type[0] === "quarterlyStockholdersEquity");
    if (parentEquity && "quarterlyStockholdersEquity" in parentEquity) {
      (parentEquity.quarterlyStockholdersEquity as Row[])[0].reportedValue.raw = 166_572;
    }
    withGrossEquity.timeseries.result.push(series("quarterlyTotalEquityGrossMinorityInterest", [quarter(176_572)]));
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => new Response(JSON.stringify(
      String(input).includes("fundamentals-timeseries") ? withGrossEquity : metadataPayload
    ), { status: 200, headers: { "Content-Type": "application/json" } })));

    const result = await fetchYahooFundamentalsResult(company);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.trailingTwelveMonths?.totalEquity).toBe(176_572);
    expect(result.data.trailingTwelveMonths?.provenance?.totalEquity?.concept).toBe("quarterlyTotalEquityGrossMinorityInterest");
    expect(result.data.trailingTwelveMonths?.minorityInterest).toBe(10_000);
    expect(result.data.trailingTwelveMonths?.provenance?.minorityInterest).toEqual(expect.objectContaining({
      provider: "yahoo-fundamentals",
      valueKind: "derived",
      inputs: ["quarterlyTotalEquityGrossMinorityInterest", "quarterlyStockholdersEquity"],
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

  it("assigns each historical period the currency reported for that exact period", async () => {
    const changedCurrency = structuredClone(timeseriesPayload);
    for (const result of changedCurrency.timeseries.result) {
      for (const row of result[result.meta.type[0]] as Row[]) {
        if (row.asOfDate === "2024-12-31") row.currencyCode = "EUR";
        if (row.asOfDate === "2025-12-31") row.currencyCode = "USD";
      }
    }
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => new Response(JSON.stringify(
      String(input).includes("fundamentals-timeseries") ? changedCurrency : metadataPayload
    ), { status: 200, headers: { "Content-Type": "application/json" } })));

    const result = await fetchYahooFundamentalsResult(company);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.annualPeriods?.map((period) => period.currency)).toEqual(["EUR", "USD"]);
  });

  it("flags conflicting monetary currencies inside one period instead of choosing one", async () => {
    const conflicting = structuredClone(timeseriesPayload);
    const assets = conflicting.timeseries.result.find((result) => result.meta.type[0] === "annualTotalAssets");
    const currentAssets = assets && "annualTotalAssets" in assets
      ? (assets.annualTotalAssets as Row[]).find((row) => row.asOfDate === "2025-12-31")
      : undefined;
    if (currentAssets) currentAssets.currencyCode = "EUR";
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => new Response(JSON.stringify(
      String(input).includes("fundamentals-timeseries") ? conflicting : metadataPayload
    ), { status: 200, headers: { "Content-Type": "application/json" } })));

    const result = await fetchYahooFundamentalsResult(company);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.annualPeriods?.at(-1)).toMatchObject({
      currency: undefined,
      currencyConflict: ["EUR", "SEK"],
    });
  });
});

describe("Yahoo semantic units", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const payload = String(input).includes("fundamentals-timeseries") ? timeseriesPayload : metadataPayload;
      return new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } });
    }));
  });

  it("labels share-count provenance as shares rather than statement currency", async () => {
    const result = await fetchYahooFundamentalsResult(company);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.trailingTwelveMonths?.provenance?.currentSharesOutstanding?.unit).toBe("shares");
    expect(result.data.annualPeriods?.at(-1)?.provenance?.sharesDiluted?.unit).toBe("shares");
    expect(result.data.trailingTwelveMonths?.provenance?.revenue?.unit).toBe("SEK");
  });
});
