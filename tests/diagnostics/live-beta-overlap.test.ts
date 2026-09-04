import { describe, expect, it } from "vitest";

const runLive = process.env.RUN_LIVE_COVERAGE === "1";
const liveIt = runLive ? it : it.skip;
const DAY_MS = 86_400_000;

type Row = { date: string; close: number };

type JsonObject = Record<string, unknown>;

const CASES = [
  ["KRI.AT", "FTSE.AT"],
  ["KARE.AT", "FTSE.AT"],
  ["SR.BK", "^SET.BK"],
  ["FMT.BK", "^SET.BK"],
  ["DNB.OL", "OSEAX.OL"],
  ["PLT.OL", "OSEAX.OL"],
  ["2285.SR", "^TASI.SR"],
  ["9515.SR", "^TASI.SR"],
  ["APR.WA", "WIG20.WA"],
  ["CPL.WA", "WIG20.WA"],
] as const;

const CANDIDATE_BENCHMARKS = [
  ["Athens", "KRI.AT", "GD.AT"],
  ["Oslo", "DNB.OL", "^OSEAX"],
  ["Oslo", "DNB.OL", "OSEBX.OL"],
  ["Warsaw", "APR.WA", "^WIG20"],
  ["Warsaw", "APR.WA", "^WIG"],
  ["Warsaw", "APR.WA", "WIG.WA"],
] as const;

function object(value: unknown): JsonObject | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : null;
}

function weekKey(date: string): string {
  const value = new Date(`${date}T00:00:00Z`);
  const daysSinceMonday = (value.getUTCDay() + 6) % 7;
  value.setUTCDate(value.getUTCDate() - daysSinceMonday);
  return value.toISOString().slice(0, 10);
}

async function chart(symbol: string, range: "2y" | "10y") {
  const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`);
  url.searchParams.set("range", range);
  url.searchParams.set("interval", "1d");
  url.searchParams.set("includeAdjustedClose", "true");
  const response = await fetch(url, { headers: { accept: "application/json" } });
  const payload = response.ok ? object(await response.json()) : null;
  const chart = object(payload?.chart);
  const result = Array.isArray(chart?.result) ? object(chart.result[0]) : null;
  const timestamps = Array.isArray(result?.timestamp) ? result.timestamp : [];
  const indicators = object(result?.indicators);
  const adjusted = Array.isArray(indicators?.adjclose) ? object(indicators.adjclose[0]) : null;
  const quote = Array.isArray(indicators?.quote) ? object(indicators.quote[0]) : null;
  const closes = Array.isArray(adjusted?.adjclose)
    ? adjusted.adjclose
    : Array.isArray(quote?.close) ? quote.close : [];
  const rows: Row[] = timestamps.flatMap((rawTimestamp, index) => {
    const timestamp = typeof rawTimestamp === "number" ? rawTimestamp : Number(rawTimestamp);
    const close = typeof closes[index] === "number" ? closes[index] as number : Number(closes[index]);
    if (!Number.isFinite(timestamp) || !Number.isFinite(close) || close <= 0) return [];
    return [{ date: new Date(timestamp * 1000).toISOString().slice(0, 10), close }];
  });
  const error = object(chart?.error);
  return {
    status: response.status,
    ok: response.ok,
    rows,
    error: typeof error?.description === "string" ? error.description : typeof error?.code === "string" ? error.code : null,
  };
}

function overlap(stock: Row[], benchmark: Row[]) {
  const stockWeekly = new Map<string, Row>();
  const benchmarkWeekly = new Map<string, Row>();
  stock.forEach((row) => stockWeekly.set(weekKey(row.date), row));
  benchmark.forEach((row) => benchmarkWeekly.set(weekKey(row.date), row));
  const commonWeeks = [...stockWeekly.keys()].filter((key) => benchmarkWeekly.has(key)).sort();
  let consecutivePairs = 0;
  for (let index = 1; index < commonWeeks.length; index += 1) {
    const previous = Date.parse(`${commonWeeks[index - 1]}T00:00:00Z`);
    const current = Date.parse(`${commonWeeks[index]}T00:00:00Z`);
    if ((current - previous) / DAY_MS === 7) consecutivePairs += 1;
  }
  const latestCommonWeek = commonWeeks.at(-1) ?? null;
  const latestStockWeek = stock.at(-1) ? weekKey(stock.at(-1)!.date) : null;
  const latestBenchmarkWeek = benchmark.at(-1) ? weekKey(benchmark.at(-1)!.date) : null;
  const commonTime = latestCommonWeek ? Date.parse(`${latestCommonWeek}T00:00:00Z`) : null;
  return {
    commonWeeks: commonWeeks.length,
    consecutivePairs,
    latestCommonWeek,
    stockLagDays: commonTime !== null && latestStockWeek ? (Date.parse(`${latestStockWeek}T00:00:00Z`) - commonTime) / DAY_MS : null,
    benchmarkLagDays: commonTime !== null && latestBenchmarkWeek ? (Date.parse(`${latestBenchmarkWeek}T00:00:00Z`) - commonTime) / DAY_MS : null,
  };
}

describe("live beta overlap diagnostics", () => {
  liveIt("traces the remaining benchmark overlap failures without changing provider behavior", async () => {
    const diagnostics = [];
    for (const [ticker, benchmark] of CASES) {
      const [stock, index] = await Promise.all([chart(ticker, "10y"), chart(benchmark, "2y")]);
      diagnostics.push({
        ticker,
        benchmark,
        stockStatus: stock.status,
        benchmarkStatus: index.status,
        stockError: stock.error,
        benchmarkError: index.error,
        stockRows: stock.rows.length,
        benchmarkRows: index.rows.length,
        stockFirst: stock.rows[0]?.date ?? null,
        stockLast: stock.rows.at(-1)?.date ?? null,
        benchmarkFirst: index.rows[0]?.date ?? null,
        benchmarkLast: index.rows.at(-1)?.date ?? null,
        ...overlap(stock.rows, index.rows),
      });
    }
    console.log("BETA_OVERLAP_DIAGNOSTIC", JSON.stringify(diagnostics));
    expect(diagnostics).toHaveLength(CASES.length);
  }, 120_000);

  liveIt("probes historically usable replacement benchmarks for markets with one-row Yahoo index feeds", async () => {
    const diagnostics = [];
    for (const [market, ticker, benchmark] of CANDIDATE_BENCHMARKS) {
      const [stock, index] = await Promise.all([chart(ticker, "10y"), chart(benchmark, "2y")]);
      diagnostics.push({
        market,
        ticker,
        benchmark,
        benchmarkStatus: index.status,
        benchmarkError: index.error,
        benchmarkRows: index.rows.length,
        benchmarkFirst: index.rows[0]?.date ?? null,
        benchmarkLast: index.rows.at(-1)?.date ?? null,
        ...overlap(stock.rows, index.rows),
      });
    }
    console.log("BETA_BENCHMARK_CANDIDATES", JSON.stringify(diagnostics));
    expect(diagnostics).toHaveLength(CANDIDATE_BENCHMARKS.length);
  }, 120_000);
});
