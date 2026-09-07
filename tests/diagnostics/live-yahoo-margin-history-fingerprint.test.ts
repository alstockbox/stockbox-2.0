import { mkdir, writeFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { searchCompanies } from "../../src/lib/data/provider";
import { fetchYahooFundamentalsResult } from "../../src/lib/data/yahoo-fundamentals";

const liveDescribe = process.env.RUN_LIVE_COVERAGE === "1" ? describe : describe.skip;
const PROBE_TICKERS = ["SIG.CO", "SRV1V.HE", "BESTE.IS", "0082.KL", "CASH3.SA", "B.V", "BEX.V"] as const;
const TYPES = [
  "annualTotalRevenue",
  "annualGrossProfit",
  "annualCostOfRevenue",
  "annualTotalOperatingIncomeAsReported",
  "annualOperatingIncome",
] as const;

type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

async function rawYahooAnnualMargins(symbol: string) {
  const url = new URL(`https://query2.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(symbol)}`);
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("type", TYPES.join(","));
  url.searchParams.set("period1", "1262304000");
  url.searchParams.set("period2", String(Math.floor(Date.now() / 1000) + 86_400));
  const response = await fetch(url, {
    headers: { accept: "application/json", "user-agent": "Mozilla/5.0 StockBox/1.0" },
  });
  const payload = response.ok ? object(await response.json()) : null;
  const timeseries = object(payload?.timeseries);
  const results = Array.isArray(timeseries?.result) ? timeseries.result : [];
  const facts = Object.fromEntries(TYPES.map((type) => [type, [] as Array<Record<string, unknown>>]));
  for (const resultValue of results) {
    const result = object(resultValue);
    if (!result) continue;
    for (const type of TYPES) {
      const metricRows = Array.isArray(result[type]) ? result[type] as unknown[] : [];
      for (const rowValue of metricRows) {
        const row = object(rowValue);
        const reported = object(row?.reportedValue);
        const date = typeof row?.asOfDate === "string" ? row.asOfDate : null;
        if (!date) continue;
        facts[type].push({
          date,
          value: finiteNumber(reported?.raw),
          currency: typeof row?.currencyCode === "string" ? row.currencyCode : null,
          periodType: typeof row?.periodType === "string" ? row.periodType : null,
        });
      }
      facts[type].sort((left, right) => String(left.date).localeCompare(String(right.date)));
    }
  }
  return {
    status: response.status,
    facts,
    error: object(timeseries?.error),
  };
}

liveDescribe("live Yahoo margin history diagnostic", () => {
  it("traces raw Yahoo margin inputs against annual adapter periods", async () => {
    const rows: Array<Record<string, unknown>> = [];
    for (const ticker of PROBE_TICKERS) {
      const candidates = await searchCompanies(ticker);
      const company = candidates.find((candidate) =>
        (candidate.canonicalTicker ?? candidate.ticker).toUpperCase() === ticker
      );
      expect(company, `Expected exact candidate for ${ticker}`).toBeTruthy();
      if (!company) continue;
      const symbol = (company.canonicalTicker ?? company.ticker).toUpperCase();
      const [raw, yahoo] = await Promise.all([
        rawYahooAnnualMargins(symbol),
        fetchYahooFundamentalsResult(company),
      ]);
      rows.push({
        ticker,
        symbol,
        rawStatus: raw.status,
        rawFacts: raw.facts,
        rawError: raw.error,
        adapterAnnualRows: yahoo.ok ? (yahoo.data.annualPeriods ?? []).map((period) => ({
          periodEndDate: period.periodEndDate ?? null,
          fiscalYear: period.fiscalYear ?? null,
          periodBasis: period.periodBasis ?? null,
          currency: period.currency ?? null,
          revenue: finiteNumber(period.revenue),
          grossProfit: finiteNumber(period.grossProfit),
          costOfRevenue: finiteNumber(period.costOfRevenue),
          operatingIncome: finiteNumber(period.operatingIncome),
          revenueProvenance: period.provenance?.revenue ?? null,
          grossProfitProvenance: period.provenance?.grossProfit ?? null,
          costOfRevenueProvenance: period.provenance?.costOfRevenue ?? null,
          operatingIncomeProvenance: period.provenance?.operatingIncome ?? null,
        })) : [],
        adapterFailure: yahoo.ok ? null : yahoo.reason,
        adapterDiagnostic: yahoo.diagnostic,
      });
    }
    await mkdir("artifacts/coverage-live", { recursive: true });
    const outputPath = "artifacts/coverage-live/yahoo-margin-history-fingerprint.json";
    await writeFile(outputPath, `${JSON.stringify(rows, null, 2)}\n`, "utf8");
    console.log(`YAHOO_MARGIN_HISTORY_DIAGNOSTIC ${JSON.stringify(rows)}`);
    expect(rows).toHaveLength(PROBE_TICKERS.length);
  }, 300_000);
});
