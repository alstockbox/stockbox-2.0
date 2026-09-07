import { mkdir, writeFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import type { CompanyFundamentals, FinancialPeriod } from "../../src/lib/analysis/types";
import { searchCompanies } from "../../src/lib/data/provider";
import { fetchCompanyFundamentalsResult } from "../../src/lib/data/sec";
import { fetchYahooFundamentalsResult } from "../../src/lib/data/yahoo-fundamentals";

const liveDescribe = process.env.RUN_LIVE_COVERAGE === "1" ? describe : describe.skip;
const PROBE_TICKERS = ["AAPL", "NVDA", "SBUX", "MSFT", "KO", "SHOP"] as const;
const FIVE_YEAR_PROBE_TICKERS = [
  "AAPL", "FMT.BK", "SIG.CO", "0205.KL", "054540.KQ", "002900.KS", "012160.KS",
  "GTT.PA", "600403.SS", "PXT.TO", "B.V", "RELIANCE.NS", "BHP.AX",
] as const;
const EPS_CAGR_PROBE_TICKERS = [
  "ASG.AX", "IPR.LS", "SNG.LS", "COP.MI", "540.SI", "9515.SR", "3603.TWO", "9984.T",
] as const;
const FIELDS = [
  "revenue", "grossProfit", "operatingIncome", "netIncome", "operatingCashFlow", "capitalExpenditures",
  "cashAndEquivalents", "totalDebt", "totalEquity", "totalAssets", "stockBasedCompensation",
] as const satisfies ReadonlyArray<keyof FinancialPeriod>;

type JsonObject = Record<string, unknown>;
type RawAnnualRow = {
  date: string;
  value: number | null;
  currency: string | null;
  periodType: string | null;
};

function object(value: unknown): JsonObject | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : null;
}
function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
function fingerprint(period: FinancialPeriod | null | undefined) {
  if (!period) return null;
  const availableFields = FIELDS.filter((field) => typeof period[field] === "number" && Number.isFinite(period[field]));
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
  return { annual: (fundamentals.annualPeriods ?? []).map(fingerprint), ttm: fingerprint(fundamentals.trailingTwelveMonths) };
}

async function rawYahooAnnualMetric(symbol: string, type: string, period2Unix?: number) {
  const url = new URL(`https://query2.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(symbol)}`);
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("type", type);
  url.searchParams.set("period1", "1262304000");
  url.searchParams.set("period2", String(period2Unix ?? Math.floor(Date.now() / 1000) + 86_400));
  const response = await fetch(url, { headers: { accept: "application/json", "user-agent": "Mozilla/5.0 StockBox/1.0" } });
  const payload = response.ok ? object(await response.json()) : null;
  const timeseries = object(payload?.timeseries);
  const results = Array.isArray(timeseries?.result) ? timeseries.result : [];
  const rows: RawAnnualRow[] = results.flatMap((resultValue) => {
    const result = object(resultValue);
    const metricRows = Array.isArray(result?.[type]) ? result[type] as unknown[] : [];
    return metricRows.flatMap((rowValue) => {
      const row = object(rowValue);
      const reported = object(row?.reportedValue);
      const date = typeof row?.asOfDate === "string" ? row.asOfDate : null;
      if (!date) return [];
      return [{
        date,
        value: finiteNumber(reported?.raw),
        currency: typeof row?.currencyCode === "string" ? row.currencyCode : null,
        periodType: typeof row?.periodType === "string" ? row.periodType : null,
      }];
    });
  }).sort((a, b) => a.date.localeCompare(b.date));
  return { status: response.status, rows, resultCount: results.length, error: object(timeseries?.error) };
}

async function rawYahooAnnualRevenue(symbol: string, period2Unix?: number) {
  return rawYahooAnnualMetric(symbol, "annualTotalRevenue", period2Unix);
}

liveDescribe("live SEC/Yahoo period alignment diagnostic", () => {
  it("captures provider period identity and field completeness before resolver merging", async () => {
    const rows: Array<Record<string, unknown>> = [];
    for (const ticker of PROBE_TICKERS) {
      const candidates = await searchCompanies(ticker);
      const company = candidates.find((candidate) => (candidate.canonicalTicker ?? candidate.ticker).toUpperCase() === ticker);
      expect(company, `Expected exact candidate for ${ticker}`).toBeTruthy();
      if (!company) continue;
      const [sec, yahoo] = await Promise.all([fetchCompanyFundamentalsResult(company), fetchYahooFundamentalsResult(company)]);
      rows.push({ ticker, cik: company.cik ?? null, sec: sec.ok ? providerFingerprint(sec.data) : { failure: sec.reason, diagnostic: sec.diagnostic }, yahoo: yahoo.ok ? providerFingerprint(yahoo.data) : { failure: yahoo.reason, diagnostic: yahoo.diagnostic } });
    }
    console.log(`SEC_YAHOO_PERIOD_FINGERPRINT ${JSON.stringify(rows)}`);
    expect(rows).toHaveLength(PROBE_TICKERS.length);
  }, 180_000);

  it("traces raw Yahoo annual revenue rows against the adapter for five-year CAGR gaps", async () => {
    const rows: Array<Record<string, unknown>> = [];
    const window2022 = Math.floor(Date.UTC(2022, 0, 1) / 1000);
    const window2021 = Math.floor(Date.UTC(2021, 0, 1) / 1000);
    for (const ticker of FIVE_YEAR_PROBE_TICKERS) {
      const candidates = await searchCompanies(ticker);
      const company = candidates.find((candidate) => (candidate.canonicalTicker ?? candidate.ticker).toUpperCase() === ticker);
      expect(company, `Expected exact candidate for ${ticker}`).toBeTruthy();
      if (!company) continue;
      const symbol = (company.canonicalTicker ?? company.ticker).toUpperCase();
      const [raw, historical2022, historical2021, yahoo] = await Promise.all([
        rawYahooAnnualRevenue(symbol), rawYahooAnnualRevenue(symbol, window2022), rawYahooAnnualRevenue(symbol, window2021), fetchYahooFundamentalsResult(company),
      ]);
      rows.push({
        ticker, symbol,
        rawStatus: raw.status, rawRevenueRows: raw.rows, rawRevenueCount: raw.rows.length,
        historical2022: { status: historical2022.status, rows: historical2022.rows, count: historical2022.rows.length, error: historical2022.error },
        historical2021: { status: historical2021.status, rows: historical2021.rows, count: historical2021.rows.length, error: historical2021.error },
        adapterAnnualRows: yahoo.ok ? (yahoo.data.annualPeriods ?? []).map((period) => ({ periodEndDate: period.periodEndDate ?? null, fiscalYear: period.fiscalYear ?? null, periodBasis: period.periodBasis ?? null, currency: period.currency ?? null, revenue: typeof period.revenue === "number" && Number.isFinite(period.revenue) ? period.revenue : null })) : [],
        adapterAnnualCount: yahoo.ok ? (yahoo.data.annualPeriods ?? []).length : 0,
        adapterFailure: yahoo.ok ? null : yahoo.reason,
        adapterDiagnostic: yahoo.diagnostic,
      });
    }
    await mkdir("artifacts/coverage-live", { recursive: true });
    await writeFile("artifacts/coverage-live/yahoo-five-year-history-fingerprint.json", `${JSON.stringify(rows, null, 2)}\n`, "utf8");
    console.log(`YAHOO_FIVE_YEAR_HISTORY_DIAGNOSTIC ${JSON.stringify(rows)}`);
    expect(rows).toHaveLength(FIVE_YEAR_PROBE_TICKERS.length);
  }, 300_000);

  it("traces raw Yahoo diluted EPS and diluted-share facts for three-year CAGR gaps", async () => {
    const rows: Array<Record<string, unknown>> = [];
    for (const ticker of EPS_CAGR_PROBE_TICKERS) {
      const candidates = await searchCompanies(ticker);
      const company = candidates.find((candidate) => (candidate.canonicalTicker ?? candidate.ticker).toUpperCase() === ticker);
      expect(company, `Expected exact candidate for ${ticker}`).toBeTruthy();
      if (!company) continue;
      const symbol = (company.canonicalTicker ?? company.ticker).toUpperCase();
      const [rawEps, rawDilutedShares, yahoo] = await Promise.all([
        rawYahooAnnualMetric(symbol, "annualDilutedEPS"),
        rawYahooAnnualMetric(symbol, "annualDilutedAverageShares"),
        fetchYahooFundamentalsResult(company),
      ]);
      rows.push({
        ticker,
        symbol,
        rawEpsStatus: rawEps.status,
        rawEpsRows: rawEps.rows,
        rawEpsCount: rawEps.rows.length,
        rawDilutedSharesStatus: rawDilutedShares.status,
        rawDilutedShareRows: rawDilutedShares.rows,
        rawDilutedShareCount: rawDilutedShares.rows.length,
        adapterAnnualRows: yahoo.ok ? (yahoo.data.annualPeriods ?? []).map((period) => ({
          periodEndDate: period.periodEndDate ?? null,
          fiscalYear: period.fiscalYear ?? null,
          periodBasis: period.periodBasis ?? null,
          currency: period.currency ?? null,
          epsDiluted: typeof period.epsDiluted === "number" && Number.isFinite(period.epsDiluted) ? period.epsDiluted : null,
          sharesDiluted: typeof period.sharesDiluted === "number" && Number.isFinite(period.sharesDiluted) ? period.sharesDiluted : null,
          epsProvenance: period.provenance?.epsDiluted ?? null,
          sharesProvenance: period.provenance?.sharesDiluted ?? null,
        })) : [],
        adapterFailure: yahoo.ok ? null : yahoo.reason,
        adapterDiagnostic: yahoo.diagnostic,
      });
    }
    await mkdir("artifacts/coverage-live", { recursive: true });
    await writeFile("artifacts/coverage-live/yahoo-eps-history-fingerprint.json", `${JSON.stringify(rows, null, 2)}\n`, "utf8");
    console.log(`YAHOO_EPS_HISTORY_DIAGNOSTIC ${JSON.stringify(rows)}`);
    expect(rows).toHaveLength(EPS_CAGR_PROBE_TICKERS.length);
  }, 300_000);
});
