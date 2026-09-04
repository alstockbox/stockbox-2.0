import { describe, expect, it } from "vitest";
import type { CompanyFundamentals, FinancialPeriod } from "../../src/lib/analysis/types";
import { searchCompanies } from "../../src/lib/data/provider";
import { fetchCompanyFundamentalsResult } from "../../src/lib/data/sec";
import { fetchYahooFundamentalsResult } from "../../src/lib/data/yahoo-fundamentals";

const liveDescribe = process.env.RUN_LIVE_COVERAGE === "1" ? describe : describe.skip;
const PROBE_TICKERS = ["AAPL", "NVDA", "SBUX", "MSFT", "KO", "SHOP"] as const;
const FIVE_YEAR_PROBE_TICKERS = ["AAPL", "FMT.BK", "SIG.CO", "0205.KL", "GTT.PA", "PXT.TO"] as const;
const FIELDS = [
  "revenue",
  "grossProfit",
  "operatingIncome",
  "netIncome",
  "operatingCashFlow",
  "capitalExpenditures",
  "cashAndEquivalents",
  "totalDebt",
  "totalEquity",
  "totalAssets",
  "stockBasedCompensation",
] as const satisfies ReadonlyArray<keyof FinancialPeriod>;

type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : null;
}

function fingerprint(period: FinancialPeriod | null | undefined) {
  if (!period) return null;
  const availableFields = FIELDS.filter((field) => {
    const value = period[field];
    return typeof value === "number" && Number.isFinite(value);
  });
  return {
    periodEndDate: period.periodEndDate ?? null,
    balanceSheetDate: period.balanceSheetDate ?? null,
    fiscalYear: period.fiscalYear ?? null,
    form: period.form ?? null,
    periodBasis: period.periodBasis ?? null,
    currency: period.currency ?? null,
    availableCount: availableFields.length,
    availableFields,
  };
}

function providerFingerprint(fundamentals: CompanyFundamentals) {
  return {
    annual: (fundamentals.annualPeriods ?? []).map(fingerprint),
    ttm: fingerprint(fundamentals.trailingTwelveMonths),
  };
}

async function rawYahooAnnualRevenue(symbol: string) {
  const url = new URL(`https://query2.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(symbol)}`);
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("type", "annualTotalRevenue");
  url.searchParams.set("period1", "1262304000");
  url.searchParams.set("period2", String(Math.floor(Date.now() / 1000) + 86_400));
  const response = await fetch(url, {
    headers: { accept: "application/json", "user-agent": "Mozilla/5.0 StockBox/1.0" },
  });
  const payload = response.ok ? object(await response.json()) : null;
  const timeseries = object(payload?.timeseries);
  const results = Array.isArray(timeseries?.result) ? timeseries.result : [];
  const dates = results.flatMap((resultValue) => {
    const result = object(resultValue);
    const rows = Array.isArray(result?.annualTotalRevenue) ? result.annualTotalRevenue : [];
    return rows.flatMap((rowValue) => {
      const row = object(rowValue);
      const date = typeof row?.asOfDate === "string" ? row.asOfDate : null;
      return date ? [date] : [];
    });
  }).sort();
  return {
    status: response.status,
    dates,
    resultCount: results.length,
    error: object(timeseries?.error),
  };
}

liveDescribe("live SEC/Yahoo period alignment diagnostic", () => {
  it("captures provider period identity and field completeness before resolver merging", async () => {
    const rows: Array<Record<string, unknown>> = [];

    for (const ticker of PROBE_TICKERS) {
      const candidates = await searchCompanies(ticker);
      const company = candidates.find((candidate) =>
        (candidate.canonicalTicker ?? candidate.ticker).toUpperCase() === ticker
      );
      expect(company, `Expected exact candidate for ${ticker}`).toBeTruthy();
      if (!company) continue;

      const [sec, yahoo] = await Promise.all([
        fetchCompanyFundamentalsResult(company),
        fetchYahooFundamentalsResult(company),
      ]);

      rows.push({
        ticker,
        cik: company.cik ?? null,
        sec: sec.ok ? providerFingerprint(sec.data) : { failure: sec.reason, diagnostic: sec.diagnostic },
        yahoo: yahoo.ok ? providerFingerprint(yahoo.data) : { failure: yahoo.reason, diagnostic: yahoo.diagnostic },
      });
    }

    console.log(`SEC_YAHOO_PERIOD_FINGERPRINT ${JSON.stringify(rows)}`);
    expect(rows).toHaveLength(PROBE_TICKERS.length);
  }, 180_000);

  it("traces raw Yahoo annual revenue rows against the adapter for five-year CAGR gaps", async () => {
    const rows: Array<Record<string, unknown>> = [];
    for (const ticker of FIVE_YEAR_PROBE_TICKERS) {
      const candidates = await searchCompanies(ticker);
      const company = candidates.find((candidate) =>
        (candidate.canonicalTicker ?? candidate.ticker).toUpperCase() === ticker
      );
      expect(company, `Expected exact candidate for ${ticker}`).toBeTruthy();
      if (!company) continue;
      const symbol = (company.canonicalTicker ?? company.ticker).toUpperCase();
      const [raw, yahoo] = await Promise.all([
        rawYahooAnnualRevenue(symbol),
        fetchYahooFundamentalsResult(company),
      ]);
      rows.push({
        ticker,
        symbol,
        rawStatus: raw.status,
        rawRevenueDates: raw.dates,
        rawRevenueCount: raw.dates.length,
        rawResultCount: raw.resultCount,
        rawError: raw.error,
        adapterAnnualDates: yahoo.ok ? (yahoo.data.annualPeriods ?? []).map((period) => period.periodEndDate ?? null) : [],
        adapterAnnualCount: yahoo.ok ? (yahoo.data.annualPeriods ?? []).length : 0,
        adapterFailure: yahoo.ok ? null : yahoo.reason,
      });
    }
    console.log(`YAHOO_FIVE_YEAR_HISTORY_DIAGNOSTIC ${JSON.stringify(rows)}`);
    expect(rows).toHaveLength(FIVE_YEAR_PROBE_TICKERS.length);
  }, 180_000);
});
