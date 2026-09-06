import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CompanySearchResult } from "@/lib/analysis/types";
import { fetchYahooFundamentalsResult } from "@/lib/data/yahoo-fundamentals";

type Row = {
  asOfDate: string;
  periodType: string;
  currencyCode: string;
  reportedValue: { raw: number; fmt: string };
};

const company: CompanySearchResult = {
  ticker: "TEST.HK",
  canonicalTicker: "TEST.HK",
  name: "Test Company",
  exchange: "HKG",
  country: "HK",
  currency: "HKD",
  securityType: "Common Stock",
};

function row(date: string, periodType: string, currencyCode: string, value: number): Row {
  return { asOfDate: date, periodType, currencyCode, reportedValue: { raw: value, fmt: String(value) } };
}

function series(type: string, rows: Row[]) {
  return { meta: { symbol: [company.ticker], type: [type] }, [type]: rows };
}

function annualPayload(includeTtmPeriod: boolean) {
  const annualDate = "2025-12-31";
  const ttmDate = "2026-06-30";
  const result = [
    series("annualTotalRevenue", [row(annualDate, "12M", "CNY", 1000)]),
    series("annualOperatingIncome", [row(annualDate, "12M", "CNY", 100)]),
    series("annualNetIncome", [row(annualDate, "12M", "CNY", 80)]),
    series("annualOperatingCashFlow", [row(annualDate, "12M", "CNY", 120)]),
    series("annualCapitalExpenditure", [row(annualDate, "12M", "CNY", -20)]),
    series("annualFreeCashFlow", [row(annualDate, "12M", "CNY", 100)]),
    series("annualTotalAssets", [row(annualDate, "12M", "CNY", 2000)]),
    series("annualTotalLiabilitiesNetMinorityInterest", [row(annualDate, "12M", "CNY", 800)]),
    series("annualStockholdersEquity", [row(annualDate, "12M", "CNY", 1200)]),
    series("annualCashAndCashEquivalents", [row(annualDate, "12M", "CNY", 300)]),
    series("annualTotalDebt", [row(annualDate, "12M", "CNY", 400)]),
    series("annualOrdinarySharesNumber", [row(annualDate, "12M", "HKD", 250)]),
    series("trailingMarketCap", [row("2026-09-03", "TTM", "HKD", 5000)]),
  ];

  if (includeTtmPeriod) {
    result.push(
      series("trailingTotalRevenue", [row(ttmDate, "TTM", "CNY", 1100)]),
      series("trailingOperatingIncome", [row(ttmDate, "TTM", "CNY", 110)]),
      series("trailingNetIncome", [row(ttmDate, "TTM", "CNY", 90)]),
      series("trailingOperatingCashFlow", [row(ttmDate, "TTM", "CNY", 130)]),
      series("trailingCapitalExpenditure", [row(ttmDate, "TTM", "CNY", -25)]),
      series("quarterlyTotalAssets", [row(ttmDate, "3M", "CNY", 2100)]),
      series("quarterlyTotalLiabilitiesNetMinorityInterest", [row(ttmDate, "3M", "CNY", 850)]),
      series("quarterlyStockholdersEquity", [row(ttmDate, "3M", "CNY", 1250)]),
      series("quarterlyCashAndCashEquivalents", [row(ttmDate, "3M", "CNY", 320)]),
      series("quarterlyTotalDebt", [row(ttmDate, "3M", "CNY", 410)]),
    );
  }

  return { timeseries: { result } };
}

function sameDateAnnualAndTtmPayload() {
  const date = "2025-12-31";
  const payload = annualPayload(false);
  payload.timeseries.result.push(
    series("trailingTotalRevenue", [row(date, "TTM", "CNY", 1000)]),
    series("trailingOperatingIncome", [row(date, "TTM", "CNY", 100)]),
    series("trailingNetIncome", [row(date, "TTM", "CNY", 80)]),
    series("trailingOperatingCashFlow", [row(date, "TTM", "CNY", 120)]),
    series("trailingCapitalExpenditure", [row(date, "TTM", "CNY", -20)]),
    series("trailingFreeCashFlow", [row(date, "TTM", "CNY", 100)]),
    series("quarterlyTotalAssets", [row(date, "3M", "CNY", 2000)]),
    series("quarterlyTotalLiabilitiesNetMinorityInterest", [row(date, "3M", "CNY", 800)]),
    series("quarterlyStockholdersEquity", [row(date, "3M", "CNY", 1200)]),
    series("quarterlyCashAndCashEquivalents", [row(date, "3M", "CNY", 300)]),
    series("quarterlyTotalDebt", [row(date, "3M", "CNY", 400)]),
  );
  return payload;
}

function installFetch(payload: object) {
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes("fundamentals-timeseries")) {
      return new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({
      quotes: [{
        symbol: company.ticker,
        quoteType: "EQUITY",
        longname: company.name,
        sector: "Industrials",
        industry: "Conglomerates",
        exchDisp: "Hong Kong",
        country: "Hong Kong",
        currency: "HKD",
      }],
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  }));
}

describe("Yahoo provider-reported valuation FCF period alignment", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("uses the latest reported annual FCF for valuation only when the financial flow itself is on annual fallback", async () => {
    installFetch(annualPayload(false));

    const result = await fetchYahooFundamentalsResult(company);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.trailingTwelveMonths).toBeUndefined();
    expect(result.data.diagnostics?.financialFlowPeriodBasis).toBe("FY");
    expect(result.data.reportedValuation).toEqual(expect.objectContaining({
      asOfDate: "2026-09-03",
      marketCap: 5000,
      marketCapCurrency: "HKD",
      freeCashFlow: 100,
      freeCashFlowCurrency: "CNY",
      freeCashFlowDate: "2025-12-31",
      freeCashFlowPeriodBasis: "FY",
    }));
  });

  it("does not mix annual FCF into provider valuation when a TTM financial period exists without reported trailing FCF", async () => {
    installFetch(annualPayload(true));

    const result = await fetchYahooFundamentalsResult(company);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.trailingTwelveMonths?.periodBasis).toBe("TTM_REPORTED");
    expect(result.data.reportedValuation).toEqual(expect.objectContaining({
      marketCap: 5000,
      marketCapCurrency: "HKD",
      freeCashFlow: null,
      freeCashFlowCurrency: null,
      freeCashFlowDate: null,
    }));
  });

  it("carries the reported TTM basis with provider valuation FCF when Yahoo reports trailing FCF", async () => {
    const payload = annualPayload(true);
    payload.timeseries.result.push(
      series("trailingFreeCashFlow", [row("2026-06-30", "TTM", "CNY", 105)]),
    );
    installFetch(payload);

    const result = await fetchYahooFundamentalsResult(company);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.reportedValuation).toEqual(expect.objectContaining({
      freeCashFlow: 105,
      freeCashFlowCurrency: "CNY",
      freeCashFlowDate: "2026-06-30",
      freeCashFlowPeriodBasis: "TTM_REPORTED",
    }));
  });

  it("uses FY basis when Yahoo reports an identical same-date direct annual FCF alongside the TTM fact", async () => {
    installFetch(sameDateAnnualAndTtmPayload());

    const result = await fetchYahooFundamentalsResult(company);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.trailingTwelveMonths?.periodBasis).toBe("TTM_REPORTED");
    expect(result.data.annualPeriods.at(-1)?.provenance?.freeCashFlow).toMatchObject({
      provider: "yahoo-fundamentals",
      valueKind: "reported",
      periodBasis: "FY",
      periodEnd: "2025-12-31",
      unit: "CNY",
    });
    expect(result.data.reportedValuation).toEqual(expect.objectContaining({
      freeCashFlow: 100,
      freeCashFlowCurrency: "CNY",
      freeCashFlowDate: "2025-12-31",
      freeCashFlowPeriodBasis: "FY",
    }));
  });
});
