import { describe, expect, it } from "vitest";
import { searchCompanies } from "../../src/lib/data/provider";
import { fetchYahooFundamentalsResult } from "../../src/lib/data/yahoo-fundamentals";

const liveDescribe = process.env.RUN_LIVE_COVERAGE === "1" ? describe : describe.skip;

const SHARE_PROBE_TICKERS = [
  "ASG.AX", "SIG.CO", "0205.KL", "IPR.LS", "SNG.LS",
  "COP.MI", "PLC.MI", "NZL.NZ", "540.SI", "3603.TWO",
] as const;

const SHARE_TYPES = [
  "annualDilutedAverageShares",
  "trailingDilutedAverageShares",
  "annualBasicAverageShares",
  "trailingBasicAverageShares",
  "annualOrdinarySharesNumber",
  "quarterlyOrdinarySharesNumber",
  "annualShareIssued",
  "quarterlyShareIssued",
  "annualTreasurySharesNumber",
  "quarterlyTreasurySharesNumber",
] as const;

type JsonObject = Record<string, unknown>;
type ShareFact = { date: string; periodType: string | null; value: number | null };

function object(value: unknown): JsonObject | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : null;
}

async function rawYahooShares(symbol: string) {
  const url = new URL(`https://query2.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(symbol)}`);
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("type", SHARE_TYPES.join(","));
  url.searchParams.set("period1", "1262304000");
  url.searchParams.set("period2", String(Math.floor(Date.now() / 1000) + 86_400));
  const response = await fetch(url, {
    headers: { accept: "application/json", "user-agent": "Mozilla/5.0 StockBox/1.0" },
  });
  const payload = response.ok ? object(await response.json()) : null;
  const timeseries = object(payload?.timeseries);
  const results = Array.isArray(timeseries?.result) ? timeseries.result : [];
  const concepts: Record<string, ShareFact[]> = {};

  for (const resultValue of results) {
    const result = object(resultValue);
    const meta = object(result?.meta);
    const type = Array.isArray(meta?.type) && typeof meta.type[0] === "string" ? meta.type[0] : null;
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
      }];
    });
  }

  return { status: response.status, error: object(timeseries?.error), concepts };
}

liveDescribe("live Yahoo share-count fingerprint", () => {
  it("traces raw share-count concepts against canonical annual periods for the dilution-gap cluster", async () => {
    const rows: Array<Record<string, unknown>> = [];

    for (const ticker of SHARE_PROBE_TICKERS) {
      const candidates = await searchCompanies(ticker);
      const company = candidates.find((candidate) =>
        (candidate.canonicalTicker ?? candidate.ticker).toUpperCase() === ticker
      );
      expect(company, `Expected exact candidate for ${ticker}`).toBeTruthy();
      if (!company) continue;
      const symbol = (company.canonicalTicker ?? company.ticker).toUpperCase();
      const [raw, yahoo] = await Promise.all([
        rawYahooShares(symbol),
        fetchYahooFundamentalsResult(company),
      ]);
      const annual = yahoo.ok ? yahoo.data.annualPeriods ?? [] : [];

      rows.push({
        ticker,
        symbol,
        rawStatus: raw.status,
        rawError: raw.error,
        rawConcepts: Object.fromEntries(Object.entries(raw.concepts).map(([concept, facts]) => [concept, {
          count: facts.length,
          dates: facts.map((fact) => fact.date),
          values: facts.map((fact) => fact.value),
        }])),
        adapter: yahoo.ok ? {
          annualCount: annual.length,
          annual: annual.map((period) => ({
            date: period.periodEndDate,
            dilutedAverageShares: period.sharesDiluted ?? null,
            ordinaryShares: period.currentSharesOutstanding ?? null,
            dilutedProvenance: period.provenance?.sharesDiluted ?? null,
            ordinaryProvenance: period.provenance?.currentSharesOutstanding ?? null,
          })),
          ttm: yahoo.data.trailingTwelveMonths ? {
            date: yahoo.data.trailingTwelveMonths.periodEndDate,
            dilutedAverageShares: yahoo.data.trailingTwelveMonths.sharesDiluted ?? null,
            ordinaryShares: yahoo.data.trailingTwelveMonths.currentSharesOutstanding ?? null,
          } : null,
        } : { failure: yahoo.reason, diagnostic: yahoo.diagnostic },
      });
    }

    console.log(`YAHOO_SHARE_COUNT_FINGERPRINT ${JSON.stringify(rows)}`);
    expect(rows).toHaveLength(SHARE_PROBE_TICKERS.length);
  }, 240_000);
});
