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

  it("marks corrected Yahoo fund-labelled operating companies as fundamentals-capable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ quotes: [{
      symbol: "DNBO.ST",
      quoteType: "MUTUALFUND",
      shortname: "DNBO.ST,0P0000EGIK,76",
      longname: "DNB Bank ASA",
      exchDisp: "Stockholm",
      currency: "NOK",
    }] }), { status: 200, headers: { "Content-Type": "application/json" } })));

    const result = await yahooCompanySearchProvider.search("DNBO.ST");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data[0]).toEqual(expect.objectContaining({
      ticker: "DNBO.ST",
      securityType: "Common Stock",
      providerCapabilities: expect.objectContaining({ fundamentals: true, marketData: true }),
    }));
  });

  it("falls back to exact Yahoo chart metadata when search omits a valid ticker symbol", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("/v1/finance/search")) {
        return new Response(JSON.stringify({ quotes: [{
          symbol: "ABAS.ST", quoteType: "EQUITY", longname: "ABAS Protect",
          exchDisp: "Stockholm", country: "Sweden", currency: "SEK",
        }] }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.includes("/v8/finance/chart/VRNT")) {
        return new Response(JSON.stringify({ chart: { result: [{
          meta: {
            symbol: "VRNT",
            instrumentType: "EQUITY",
            longName: "Verint Systems Inc.",
            fullExchangeName: "NasdaqGS",
            currency: "USD",
          },
        }] } }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ chart: { error: { code: "Not Found" } } }), { status: 404, headers: { "Content-Type": "application/json" } });
    }));

    const result = await yahooCompanySearchProvider.search("VRNT");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toEqual(expect.arrayContaining([
      expect.objectContaining({
        ticker: "VRNT",
        canonicalTicker: "VRNT",
        name: "Verint Systems Inc.",
        exchange: "NasdaqGS",
        currency: "USD",
        providerCapabilities: expect.objectContaining({ fundamentals: true, marketData: true }),
      }),
    ]));
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

  it("returns timeout when a Yahoo fundamentals request exceeds the provider deadline", async () => {
    vi.useFakeTimers();
    try {
      const observedSignals: AbortSignal[] = [];
      vi.stubGlobal("fetch", vi.fn((_input: string | URL | Request, init?: RequestInit) => {
        const signal = init?.signal as AbortSignal | undefined;
        if (signal) observedSignals.push(signal);
        return new Promise<Response>((_resolve, reject) => {
          signal?.addEventListener("abort", () => {
            const error = new Error("aborted");
            error.name = "AbortError";
            reject(error);
          });
        });
      }));

      const pending = fetchYahooFundamentalsResult(company);
      await vi.runOnlyPendingTimersAsync();
      const result = await Promise.race([pending, Promise.resolve("still_pending" as const)]);

      expect(observedSignals.length).toBeGreaterThan(0);
      expect(observedSignals.every((signal) => signal.aborted)).toBe(true);
      expect(result).toEqual(expect.objectContaining({ ok: false, reason: "timeout" }));
    } finally {
      vi.useRealTimers();
    }
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
    ["Financial Services", "Credit Services", "unknown", 0.75],
    ["Financial Services", "Shell Companies", "unknown", 0.75],
    ["Financial Services", "Financial Conglomerates", "unknown", 0.75],
    ["Real Estate", "Real Estate Services", "property_company", 0.7],
  ] as const)("preserves a confident unsupported specialist classification instead of replacing it with a generic sector fallback: %s / %s", async (sector, industry, archetype, minimumConfidence) => {
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

  it("uses the selected company name when Yahoo fundamentals metadata omits the issuer name", async () => {
    const namelessAssetManagementMetadata = {
      quotes: [{ symbol: "VOLV-B.ST", sector: "Financial Services", industry: "Asset Management" }],
    };
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => new Response(JSON.stringify(
      String(input).includes("fundamentals-timeseries") ? timeseriesPayload : namelessAssetManagementMetadata
    ), { status: 200, headers: { "Content-Type": "application/json" } })));

    const corporateFinance = await fetchYahooFundamentalsResult({
      ...company,
      name: "Nordic Corporate Finance AB",
    });
    expect(corporateFinance.ok).toBe(true);
    if (!corporateFinance.ok) return;
    expect(corporateFinance.data.analysisArchetype).toBe("unknown");
    expect(corporateFinance.data.classificationDiagnostics?.reason).toContain("capital-markets");

    const investmentVehicle = await fetchYahooFundamentalsResult({
      ...company,
      name: "Nordic Investment AB",
    });
    expect(investmentVehicle.ok).toBe(true);
    if (!investmentVehicle.ok) return;
    expect(investmentVehicle.data.analysisArchetype).toBe("holding_company");
  });

  it("uses the selected company name when Yahoo metadata only supplies a ticker-like short name", async () => {
    const tickerOnlyAssetManagementMetadata = {
      quotes: [{ symbol: "VOLV-B.ST", sector: "Financial Services", industry: "Asset Management", shortname: "VOLV-B.ST" }],
    };
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => new Response(JSON.stringify(
      String(input).includes("fundamentals-timeseries") ? timeseriesPayload : tickerOnlyAssetManagementMetadata
    ), { status: 200, headers: { "Content-Type": "application/json" } })));

    const result = await fetchYahooFundamentalsResult({
      ...company,
      name: "Nordic Corporate Finance AB",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.analysisArchetype).toBe("unknown");
    expect(result.data.classificationDiagnostics?.reason).toContain("capital-markets");
  });

  it("retains eleven annual observations so a true 10Y CAGR can be calculated", async () => {
    const dates = Array.from({ length: 12 }, (_, index) => `${2015 + index}-12-31`);
    const longHistoryPayload = {
      timeseries: {
        result: [
          series("annualTotalRevenue", dates.map((date, index) => annual(date, 100 + index * 10))),
          series("annualNetIncome", dates.map((date, index) => annual(date, 10 + index))),
          series("annualTotalAssets", dates.map((date, index) => annual(date, 200 + index * 10))),
        ],
      },
    };
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => new Response(JSON.stringify(
      String(input).includes("fundamentals-timeseries") ? longHistoryPayload : metadataPayload
    ), { status: 200, headers: { "Content-Type": "application/json" } })));

    const result = await fetchYahooFundamentalsResult(company);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.annualPeriods).toHaveLength(11);
    expect(result.data.annualPeriods?.[0]?.periodEndDate).toBe("2016-12-31");
    expect(result.data.annualPeriods?.at(-1)?.periodEndDate).toBe("2026-12-31");
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

  it("preserves a prior reported TTM period with its matching balance sheet", async () => {
    const payload = structuredClone(timeseriesPayload);
    const addPrior = (type: string, periodType: "TTM" | "3M", value: number) => {
      const item = payload.timeseries.result.find((candidate) => candidate.meta.type[0] === type);
      if (!item) throw new Error(`Missing fixture series ${type}`);
      (item[type as keyof typeof item] as unknown as Row[]).unshift({ asOfDate: "2025-06-30", periodType, currencyCode: "SEK", reportedValue: { raw: value, fmt: String(value) } });
    };
    addPrior("trailingTotalRevenue", "TTM", 450_000);
    addPrior("trailingOperatingIncome", "TTM", 45_000);
    addPrior("trailingNetIncome", "TTM", 31_000);
    addPrior("trailingOperatingCashFlow", "TTM", 44_000);
    addPrior("trailingCapitalExpenditure", "TTM", -23_000);
    addPrior("quarterlyTotalAssets", "3M", 620_000);
    addPrior("quarterlyTotalLiabilitiesNetMinorityInterest", "3M", 450_000);
    addPrior("quarterlyStockholdersEquity", "3M", 170_000);
    addPrior("quarterlyCashAndCashEquivalents", "3M", 61_000);
    addPrior("quarterlyTotalDebt", "3M", 230_000);
    addPrior("quarterlyCurrentAssets", "3M", 290_000);
    addPrior("quarterlyCurrentLiabilities", "3M", 250_000);
    addPrior("quarterlyOrdinarySharesNumber", "3M", 2_033);
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => new Response(JSON.stringify(String(input).includes("fundamentals-timeseries") ? payload : metadataPayload), { status: 200, headers: { "Content-Type": "application/json" } })));
    const result = await fetchYahooFundamentalsResult(company);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.priorTrailingTwelveMonths).toEqual(expect.objectContaining({ periodEndDate: "2025-06-30", balanceSheetDate: "2025-06-30", revenue: 450_000, operatingIncome: 45_000, netIncome: 31_000, totalAssets: 620_000, totalDebt: 230_000 }));
  });

  it("preserves fresh provider-reported valuation ratios for currency-safe fallback scoring", async () => {
    const payload = structuredClone(timeseriesPayload);
    const ratio = (date: string, value: number): Row => ({
      asOfDate: date,
      periodType: "TTM",
      currencyCode: "",
      reportedValue: { raw: value, fmt: String(value) },
    });
    payload.timeseries.result.push(
      series("trailingPeRatio", [ratio("2026-08-27", 18.5)]),
      series("trailingPsRatio", [ratio("2026-08-27", 2.4)]),
      series("trailingPbRatio", [ratio("2026-08-27", 4.1)]),
      series("trailingPegRatio", [ratio("2026-08-27", 1.3)]),
      series("trailingEnterprisesValueRevenueRatio", [ratio("2026-08-27", 2.7)]),
      series("trailingEnterprisesValueEBITDARatio", [ratio("2026-08-27", 9.2)]),
      series("trailingEnterpriseValue", [{ ...trailing(750_000), asOfDate: "2026-08-27" }]),
      series("trailingFreeCashFlow", [trailing(30_000)]),
    );
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => new Response(JSON.stringify(
      String(input).includes("fundamentals-timeseries") ? payload : metadataPayload
    ), { status: 200, headers: { "Content-Type": "application/json" } })));

    const result = await fetchYahooFundamentalsResult(company);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.reportedValuation).toEqual(expect.objectContaining({
      provider: "Yahoo Finance fundamentals timeseries",
      asOfDate: "2026-08-27",
      priceEarnings: 18.5,
      priceSales: 2.4,
      priceBook: 4.1,
      evSales: 2.7,
      evEbitda: 9.2,
      peg: 1.3,
      enterpriseValue: 750_000,
      freeCashFlow: 30_000,
    }));
  });

  it("maps global bank facts into specialized metrics without fabricating regulatory ratios", async () => {
    const payload = structuredClone(timeseriesPayload);
    payload.timeseries.result.push(
      series("annualNetInterestIncome", [annual("2024-12-31", 50_000), annual("2025-12-31", 55_000)]),
      series("trailingNetInterestIncome", [trailing(60_000)]),
      series("annualNonInterestIncome", [annual("2025-12-31", 25_000)]),
      series("trailingNonInterestIncome", [trailing(30_000)]),
      series("annualNonInterestExpense", [annual("2025-12-31", 50_000)]),
      series("trailingNonInterestExpense", [trailing(54_000)]),
      series("annualLoansReceivable", [annual("2024-12-31", 500_000), annual("2025-12-31", 550_000)]),
      series("quarterlyLoansReceivable", [quarter(575_000)]),
      series("annualTotalDeposits", [annual("2024-12-31", 600_000), annual("2025-12-31", 660_000)]),
      series("quarterlyTotalDeposits", [quarter(690_000)]),
      series("annualCreditLossesProvision", [annual("2025-12-31", 5_000)]),
      series("trailingCreditLossesProvision", [trailing(6_000)]),
      series("annualTangibleBookValue", [annual("2024-12-31", 150_000), annual("2025-12-31", 160_000)]),
      series("quarterlyTangibleBookValue", [quarter(165_000)]),
      series("annualCommonStockEquity", [annual("2024-12-31", 160_000), annual("2025-12-31", 170_000)]),
    );
    const requestedUrls: string[] = [];
    const bankMetadata = { quotes: [{ symbol: "VOLV-B.ST", sector: "Financial Services", industry: "Banks—Diversified", longname: "Global Bank" }] };
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      requestedUrls.push(String(input));
      return new Response(JSON.stringify(String(input).includes("fundamentals-timeseries") ? payload : bankMetadata), { status: 200, headers: { "Content-Type": "application/json" } });
    }));
    const result = await fetchYahooFundamentalsResult(company);
    expect(result.ok).toBe(true); if (!result.ok) return;
    const requestedTypes = new URL(requestedUrls.find((url) => url.includes("fundamentals-timeseries"))!).searchParams.get("type") ?? "";
    expect(requestedTypes).toContain("trailingNonInterestIncome");
    expect(requestedTypes).toContain("trailingNonInterestExpense");
    expect(result.data.analysisArchetype).toBe("bank");
    const bank = result.data.specialized;
    expect(bank?.kind).toBe("bank");
    if (bank?.kind !== "bank") throw new Error("Expected bank specialized data.");
    expect(bank.netInterestIncome.value).toBe(60_000);
    expect(bank.depositGrowth.value).toBeCloseTo(0.1, 8);
    expect(bank.netInterestIncomeGrowth.value).toBeCloseTo(0.1, 8);
    expect(bank.grossLoanGrowth.value).toBeCloseTo(0.1, 8);
    expect(bank.loanLossProvisions.value).toBe(6_000);
    expect(bank.returnOnAssets.value).toBeCloseTo(34_456 / ((620_000 + 648_590) / 2), 8);
    expect(bank.returnOnEquity.value).toBeCloseTo(34_456 / ((160_000 + 170_000) / 2), 8);
    expect(bank.returnOnTangibleCommonEquity.value).toBeCloseTo(34_456 / ((150_000 + 160_000) / 2), 8);
    expect(bank.efficiencyRatio.value).toBeCloseTo(54_000 / (60_000 + 30_000), 8);
    expect(bank.cet1CapitalRatio.value).toBeNull();
    expect(bank.nonPerformingLoans.value).toBeNull();
  });

  it("uses Yahoo NetLoan as the reported bank loan base when LoansReceivable is absent", async () => {
    const payload = structuredClone(timeseriesPayload);
    payload.timeseries.result.push(
      series("annualNetInterestIncome", [annual("2024-12-31", 50_000), annual("2025-12-31", 55_000)]),
      series("trailingNetInterestIncome", [trailing(60_000)]),
      series("annualNetLoan", [annual("2024-12-31", 500_000), annual("2025-12-31", 550_000)]),
      series("quarterlyNetLoan", [quarter(575_000)]),
      series("annualTotalDeposits", [annual("2024-12-31", 600_000), annual("2025-12-31", 660_000)]),
      series("quarterlyTotalDeposits", [quarter(690_000)]),
    );
    const requestedUrls: string[] = [];
    const bankMetadata = { quotes: [{ symbol: "VOLV-B.ST", sector: "Financial Services", industry: "Banks-Diversified", longname: "Global Bank" }] };
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      requestedUrls.push(String(input));
      return new Response(JSON.stringify(String(input).includes("fundamentals-timeseries") ? payload : bankMetadata), { status: 200, headers: { "Content-Type": "application/json" } });
    }));

    const result = await fetchYahooFundamentalsResult(company);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const requestedTypes = new URL(requestedUrls.find((url) => url.includes("fundamentals-timeseries"))!).searchParams.get("type") ?? "";
    expect(requestedTypes).toContain("annualNetLoan");
    expect(requestedTypes).toContain("quarterlyNetLoan");
    const bank = result.data.specialized;
    expect(bank?.kind).toBe("bank");
    if (bank?.kind !== "bank") throw new Error("Expected bank specialized data.");
    expect(bank.grossLoans.value).toBe(575_000);
    expect(bank.grossLoans.provenance?.concept).toBe("quarterlyNetLoan");
    expect(bank.grossLoanGrowth.value).toBeCloseTo(0.1, 8);
    expect(bank.grossLoanGrowth.provenance?.inputs).toEqual(["annualNetLoan", "annualNetLoan"]);
  });

  it("uses four same-currency quarterly bank flows when annual and reported TTM flows are unavailable", async () => {
    const payload = structuredClone(timeseriesPayload);
    const quarterly = (date: string, value: number): Row => ({
      asOfDate: date,
      periodType: "3M",
      currencyCode: "SEK",
      reportedValue: { raw: value, fmt: String(value) },
    });
    payload.timeseries.result.push(
      series("quarterlyNetInterestIncome", [
        quarterly("2025-06-30", 10_000),
        quarterly("2025-09-30", 11_000),
        quarterly("2025-12-31", 12_000),
        quarterly("2026-03-31", 13_000),
      ]),
      series("quarterlyCreditLossesProvision", [
        quarterly("2025-06-30", -100),
        quarterly("2025-09-30", -200),
        quarterly("2025-12-31", -300),
        quarterly("2026-03-31", -400),
      ]),
      series("quarterlyNonInterestIncome", [
        quarterly("2025-06-30", 1_000),
        quarterly("2025-09-30", 1_100),
        quarterly("2025-12-31", 1_200),
        quarterly("2026-03-31", 1_300),
      ]),
      series("quarterlyNonInterestExpense", [
        quarterly("2025-06-30", -4_000),
        quarterly("2025-09-30", -4_100),
        quarterly("2025-12-31", -4_200),
        quarterly("2026-03-31", -4_300),
      ]),
    );
    const requestedUrls: string[] = [];
    const bankMetadata = { quotes: [{ symbol: "VOLV-B.ST", sector: "Financial Services", industry: "Banks-Diversified", longname: "Global Bank" }] };
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      requestedUrls.push(String(input));
      return new Response(JSON.stringify(String(input).includes("fundamentals-timeseries") ? payload : bankMetadata), { status: 200, headers: { "Content-Type": "application/json" } });
    }));

    const result = await fetchYahooFundamentalsResult(company);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const requestedTypes = new URL(requestedUrls.find((url) => url.includes("fundamentals-timeseries"))!).searchParams.get("type") ?? "";
    expect(requestedTypes).toContain("quarterlyCreditLossesProvision");
    expect(requestedTypes).toContain("quarterlyNetInterestIncome");
    expect(requestedTypes).toContain("quarterlyNonInterestIncome");
    expect(requestedTypes).toContain("quarterlyNonInterestExpense");
    const bank = result.data.specialized;
    expect(bank?.kind).toBe("bank");
    if (bank?.kind !== "bank") throw new Error("Expected bank specialized data.");
    expect(bank.netInterestIncome.value).toBe(46_000);
    expect(bank.netInterestIncome.provenance?.valueKind).toBe("derived");
    expect(bank.loanLossProvisions.value).toBe(1_000);
    expect(bank.loanLossProvisions.provenance?.valueKind).toBe("derived");
    expect(bank.efficiencyRatio.value).toBeCloseTo(16_600 / (46_000 + 4_600), 8);
  });

  it("maps Yahoo insurer book metrics and returns without fabricating regulatory coverage", async () => {
    const payload = structuredClone(timeseriesPayload);
    payload.timeseries.result.push(
      series("annualPremiumRevenue", [annual("2024-12-31", 300_000), annual("2025-12-31", 330_000)]),
      series("annualCommonStockEquity", [annual("2024-12-31", 160_000), annual("2025-12-31", 170_000)]),
      series("quarterlyCommonStockEquity", [quarter(180_000)]),
      series("annualTangibleBookValue", [annual("2024-12-31", 145_000), annual("2025-12-31", 150_000)]),
      series("quarterlyTangibleBookValue", [quarter(155_000)]),
      series("annualLossAdjustmentExpense", [annual("2025-12-31", 210_000)]),
      series("annualUnderwritingExpense", [annual("2025-12-31", 33_000)]),
    );
    const requestedUrls: string[] = [];
    const insurerMetadata = { quotes: [{ symbol: "VOLV-B.ST", sector: "Financial Services", industry: "Insurance - Property & Casualty", longname: "Global Insurer" }] };
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      requestedUrls.push(String(input));
      return new Response(JSON.stringify(String(input).includes("fundamentals-timeseries") ? payload : insurerMetadata), { status: 200, headers: { "Content-Type": "application/json" } });
    }));

    const result = await fetchYahooFundamentalsResult(company);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const requestedTypes = new URL(requestedUrls.find((url) => url.includes("fundamentals-timeseries"))!).searchParams.get("type") ?? "";
    expect(requestedTypes).toContain("annualPremiumRevenue");
    expect(requestedTypes).toContain("annualLossAdjustmentExpense");
    expect(requestedTypes).toContain("annualUnderwritingExpense");
    expect(result.data.analysisArchetype).toBe("insurer");
    const insurer = result.data.specialized;
    expect(insurer?.kind).toBe("insurer");
    if (insurer?.kind !== "insurer") throw new Error("Expected insurer specialized data.");
    expect(insurer.premiumGrowth.value).toBeCloseTo(0.1, 8);
    expect(insurer.bookValue.value).toBe(180_000);
    expect(insurer.bookValue.provenance?.concept).toBe("quarterlyCommonStockEquity");
    expect(insurer.tangibleBookValue.value).toBe(155_000);
    expect(insurer.returnOnEquity.value).toBeCloseTo(34_456 / ((160_000 + 170_000) / 2), 8);
    expect(insurer.lossRatio.value).toBeCloseTo(210_000 / 330_000, 8);
    expect(insurer.expenseRatio.value).toBeCloseTo(33_000 / 330_000, 8);
    expect(insurer.combinedRatio.value).toBeCloseTo(243_000 / 330_000, 8);
    expect(insurer.regulatoryCapitalRatio.value).toBeNull();
    expect(insurer.reserveDevelopment.value).toBeNull();
  });

  it("uses Yahoo written-premium aliases for insurer growth and same-period loss ratios", async () => {
    const payload = structuredClone(timeseriesPayload);
    payload.timeseries.result.push(
      series("annualNetPremiumsWritten", [annual("2024-12-31", 300_000), annual("2025-12-31", 330_000)]),
      series("annualLossAdjustmentExpense", [annual("2025-12-31", 210_000)]),
      series("trailingLossAdjustmentExpense", [trailing(240_000)]),
      series("annualCommonStockEquity", [annual("2024-12-31", 160_000), annual("2025-12-31", 170_000)]),
      series("quarterlyCommonStockEquity", [quarter(180_000)]),
    );
    const requestedUrls: string[] = [];
    const insurerMetadata = { quotes: [{ symbol: "VOLV-B.ST", sector: "Financial Services", industry: "Insurance - Property & Casualty", longname: "Global Insurer" }] };
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      requestedUrls.push(String(input));
      return new Response(JSON.stringify(String(input).includes("fundamentals-timeseries") ? payload : insurerMetadata), { status: 200, headers: { "Content-Type": "application/json" } });
    }));

    const result = await fetchYahooFundamentalsResult(company);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const requestedTypes = new URL(requestedUrls.find((url) => url.includes("fundamentals-timeseries"))!).searchParams.get("type") ?? "";
    expect(requestedTypes).toContain("annualNetPremiumsWritten");
    expect(requestedTypes).toContain("trailingNetPremiumsWritten");
    const insurer = result.data.specialized;
    expect(insurer?.kind).toBe("insurer");
    if (insurer?.kind !== "insurer") throw new Error("Expected insurer specialized data.");
    expect(insurer.premiumGrowth.value).toBeCloseTo(0.1, 8);
    expect(insurer.premiumGrowth.provenance?.inputs).toEqual(["annualNetPremiumsWritten", "annualNetPremiumsWritten"]);
    expect(insurer.lossRatio.value).toBeCloseTo(210_000 / 330_000, 8);
    expect(insurer.lossRatio.dataAsOf).toBe("2025-12-31");
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

  it("maps Yahoo reported annual free cash flow into annual periods when cash-flow line items are sparse", async () => {
    const payload = structuredClone(timeseriesPayload);
    payload.timeseries.result = payload.timeseries.result.filter((item) => ![
      "annualOperatingCashFlow",
      "annualCapitalExpenditure",
      "annualPurchaseOfPPE",
    ].includes(item.meta.type[0]));
    payload.timeseries.result.push(
      series("annualFreeCashFlow", [annual("2024-12-31", 24_000), annual("2025-12-31", 19_465)]),
    );
    const requestedUrls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      requestedUrls.push(String(input));
      return new Response(JSON.stringify(
        String(input).includes("fundamentals-timeseries") ? payload : metadataPayload
      ), { status: 200, headers: { "Content-Type": "application/json" } });
    }));
    const result = await fetchYahooFundamentalsResult(company);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const requestedTypes = new URL(requestedUrls.find((url) => url.includes("fundamentals-timeseries"))!).searchParams.get("type") ?? "";
    expect(requestedTypes).toContain("annualFreeCashFlow");
    expect(result.data.annualPeriods?.at(-1)?.freeCashFlow).toBe(19_465);
    expect(result.data.annualPeriods?.at(-1)?.provenance?.freeCashFlow?.concept).toBe("annualFreeCashFlow");
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

  it("derives total debt from same-date current and long-term debt including lease obligations when Yahoo omits TotalDebt", async () => {
    const payload = structuredClone(timeseriesPayload);
    payload.timeseries.result = payload.timeseries.result.filter((item) => item.meta.type[0] !== "annualTotalDebt" && item.meta.type[0] !== "quarterlyTotalDebt");
    payload.timeseries.result.push(
      series("annualLongTermDebtAndCapitalLeaseObligation", [annual("2024-12-31", 180_000), annual("2025-12-31", 190_000)]),
      series("annualCurrentDebtAndCapitalLeaseObligation", [annual("2024-12-31", 30_000), annual("2025-12-31", 35_000)]),
      series("quarterlyLongTermDebtAndCapitalLeaseObligation", [quarter(200_000)]),
      series("quarterlyCurrentDebtAndCapitalLeaseObligation", [quarter(40_000)]),
    );
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => new Response(JSON.stringify(
      String(input).includes("fundamentals-timeseries") ? payload : metadataPayload
    ), { status: 200, headers: { "Content-Type": "application/json" } })));

    const result = await fetchYahooFundamentalsResult(company);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.annualPeriods?.at(-1)?.totalDebt).toBe(225_000);
    expect(result.data.trailingTwelveMonths?.totalDebt).toBe(240_000);
    expect(result.data.annualPeriods?.at(-1)?.provenance?.totalDebt).toEqual(expect.objectContaining({
      provider: "yahoo-fundamentals",
      valueKind: "derived",
      inputs: ["annualLongTermDebtAndCapitalLeaseObligation", "annualCurrentDebtAndCapitalLeaseObligation"],
    }));
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
    expect(result.data.trailingTwelveMonths?.totalEquity).toBe(166_572);
    expect(result.data.trailingTwelveMonths?.provenance?.totalEquity?.concept).toBe("quarterlyStockholdersEquity");
    expect(result.data.trailingTwelveMonths?.minorityInterest).toBe(10_000);
    expect(result.data.trailingTwelveMonths?.provenance?.minorityInterest).toEqual(expect.objectContaining({
      provider: "yahoo-fundamentals",
      valueKind: "derived",
      inputs: ["quarterlyTotalEquityGrossMinorityInterest", "quarterlyStockholdersEquity"],
    }));
    expect(
      (result.data.trailingTwelveMonths?.totalLiabilities ?? 0)
      + (result.data.trailingTwelveMonths?.totalEquity ?? 0)
      + (result.data.trailingTwelveMonths?.minorityInterest ?? 0),
    ).toBe(result.data.trailingTwelveMonths?.totalAssets);
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
