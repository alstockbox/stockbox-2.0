import { describe, expect, it } from "vitest";
import { searchCompanies } from "../../src/lib/data/provider";
import { fetchYahooFundamentalsResult } from "../../src/lib/data/yahoo-fundamentals";

const liveDescribe = process.env.RUN_LIVE_COVERAGE === "1" ? describe : describe.skip;

const OCF_PROBE_TICKERS = [
  "ASG.AX", "ERG.AX", "SRV1V.HE", "DUTI.JK", "SKLT.JK",
  "IPR.LS", "SNG.LS", "COP.MI", "NZL.NZ", "BGP.NZ",
] as const;

const CASH_FLOW_TYPES = [
  "annualOperatingCashFlow",
  "trailingOperatingCashFlow",
  "annualFreeCashFlow",
  "trailingFreeCashFlow",
  "annualPurchaseOfPPE",
  "trailingPurchaseOfPPE",
  "annualCapitalExpenditure",
  "trailingCapitalExpenditure",
] as const;

type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : null;
}

async function rawYahooCashFlow(symbol: string) {
  const url = new URL(`https://query2.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(symbol)}`);
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("type", CASH_FLOW_TYPES.join(","));
  url.searchParams.set("period1", "1262304000");
  url.searchParams.set("period2", String(Math.floor(Date.now() / 1000) + 86_400));
  const response = await fetch(url, {
    headers: { accept: "application/json", "user-agent": "Mozilla/5.0 StockBox/1.0" },
  });
  const payload = response.ok ? object(await response.json()) : null;
  const timeseries = object(payload?.timeseries);
  const results = Array.isArray(timeseries?.result) ? timeseries.result : [];
  const concepts: Record<string, Array<{ date: string; periodType: string | null; value: number | null; currency: string | null }>> = {};

  for (const resultValue of results) {
    const result = object(resultValue);
    const meta = object(result?.meta);
    const type = Array.isArray(meta?.type) && typeof meta?.type[0] === "string" ? meta.type[0] : null;
    if (!result || !type) continue;
    const rows = Array.isArray(result[type]) ? result[type] : [];
    concepts[type] = rows.flatMap((rowValue) => {
      const row = object(rowValue);
      const reported = object(row?.reportedValue);
      const date = typeof row?.asOfDate === "string" ? row.asOfDate : null;
      if (!date) return [];
      return [{
        date,
        periodType: typeof row?.periodType === "string" ? row.periodType : null,
        value: typeof reported?.raw === "number" && Number.isFinite(reported.raw) ? reported.raw : null,
        currency: typeof row?.currencyCode === "string" ? row.currencyCode : null,
      }];
    });
  }

  return {
    status: response.status,
    error: object(timeseries?.error),
    concepts,
  };
}

liveDescribe("live Yahoo cash-flow fingerprint", () => {
  it("traces raw OCF, FCF and capex availability for the systemic OCF-missing cluster", async () => {
    const rows: Array<Record<string, unknown>> = [];

    for (const ticker of OCF_PROBE_TICKERS) {
      const candidates = await searchCompanies(ticker);
      const company = candidates.find((candidate) =>
        (candidate.canonicalTicker ?? candidate.ticker).toUpperCase() === ticker
      );
      expect(company, `Expected exact candidate for ${ticker}`).toBeTruthy();
      if (!company) continue;
      const symbol = (company.canonicalTicker ?? company.ticker).toUpperCase();
      const [raw, yahoo] = await Promise.all([
        rawYahooCashFlow(symbol),
        fetchYahooFundamentalsResult(company),
      ]);
      const latestAnnual = yahoo.ok ? yahoo.data.annualPeriods?.at(-1) ?? null : null;
      const ttm = yahoo.ok ? yahoo.data.trailingTwelveMonths ?? null : null;

      rows.push({
        ticker,
        symbol,
        rawStatus: raw.status,
        rawError: raw.error,
        rawConcepts: Object.fromEntries(Object.entries(raw.concepts).map(([concept, facts]) => [concept, {
          count: facts.length,
          dates: facts.map((fact) => fact.date),
          latest: facts.at(-1) ?? null,
        }])),
        adapter: yahoo.ok ? {
          annualCount: yahoo.data.annualPeriods?.length ?? 0,
          latestAnnualDate: latestAnnual?.periodEndDate ?? null,
          latestAnnualOperatingCashFlow: latestAnnual?.operatingCashFlow ?? null,
          latestAnnualFreeCashFlow: latestAnnual?.freeCashFlow ?? null,
          latestAnnualCapex: latestAnnual?.capitalExpenditures ?? null,
          ttmDate: ttm?.periodEndDate ?? null,
          ttmOperatingCashFlow: ttm?.operatingCashFlow ?? null,
          ttmFreeCashFlow: ttm?.freeCashFlow ?? null,
          ttmCapex: ttm?.capitalExpenditures ?? null,
        } : {
          failure: yahoo.reason,
          diagnostic: yahoo.diagnostic,
        },
      });
    }

    console.log(`YAHOO_CASH_FLOW_FINGERPRINT ${JSON.stringify(rows)}`);
    expect(rows).toHaveLength(OCF_PROBE_TICKERS.length);
  }, 240_000);
});
