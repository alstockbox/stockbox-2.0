import { mkdir, writeFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { searchCompanies } from "../../src/lib/data/provider";
import { fetchYahooFundamentalsResult } from "../../src/lib/data/yahoo-fundamentals";

const liveDescribe = process.env.RUN_LIVE_COVERAGE === "1" ? describe : describe.skip;

const DEBT_GAP_TICKERS = ["BESTE.IS", "CASH3.SA", "B.V"] as const;

const DEBT_TYPES = [
  "annualTotalDebt",
  "quarterlyTotalDebt",
  "annualNetDebt",
  "quarterlyNetDebt",
  "annualLongTermDebtAndCapitalLeaseObligation",
  "quarterlyLongTermDebtAndCapitalLeaseObligation",
  "annualCurrentDebtAndCapitalLeaseObligation",
  "quarterlyCurrentDebtAndCapitalLeaseObligation",
  "annualLongTermDebt",
  "quarterlyLongTermDebt",
  "annualCurrentDebt",
  "quarterlyCurrentDebt",
  "annualLongTermCapitalLeaseObligation",
  "quarterlyLongTermCapitalLeaseObligation",
  "annualCurrentCapitalLeaseObligation",
  "quarterlyCurrentCapitalLeaseObligation",
  "annualCapitalLeaseObligations",
  "quarterlyCapitalLeaseObligations",
  "annualCashAndCashEquivalents",
  "quarterlyCashAndCashEquivalents",
  "annualCashCashEquivalentsAndShortTermInvestments",
  "quarterlyCashCashEquivalentsAndShortTermInvestments",
] as const;

type JsonObject = Record<string, unknown>;
type RawFact = {
  date: string;
  periodType: string | null;
  value: number | null;
  currency: string | null;
};

function object(value: unknown): JsonObject | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : null;
}

async function rawYahooDebt(symbol: string) {
  const url = new URL(`https://query2.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(symbol)}`);
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("type", DEBT_TYPES.join(","));
  url.searchParams.set("period1", "1262304000");
  url.searchParams.set("period2", String(Math.floor(Date.now() / 1000) + 86_400));

  const response = await fetch(url, {
    headers: { accept: "application/json", "user-agent": "Mozilla/5.0 StockBox/1.0" },
  });
  const payload = response.ok ? object(await response.json()) : null;
  const timeseries = object(payload?.timeseries);
  const results = Array.isArray(timeseries?.result) ? timeseries.result : [];
  const concepts: Record<string, RawFact[]> = {};

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

function selectedQuoteFields(value: unknown, pattern: RegExp): Record<string, unknown> {
  const source = object(value);
  if (!source) return {};
  return Object.fromEntries(Object.entries(source).flatMap(([key, field]) => {
    if (!pattern.test(key)) return [];
    const wrapped = object(field);
    return [[key, wrapped ? {
      raw: wrapped.raw ?? null,
      fmt: wrapped.fmt ?? null,
      longFmt: wrapped.longFmt ?? null,
    } : field]];
  }));
}

async function rawYahooQuoteSummaryDebt(symbol: string) {
  const url = new URL(`https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}`);
  url.searchParams.set("modules", "financialData,balanceSheetHistoryQuarterly");
  const response = await fetch(url, {
    headers: { accept: "application/json", "user-agent": "Mozilla/5.0 StockBox/1.0" },
  });
  let payload: JsonObject | null = null;
  try {
    payload = object(await response.json());
  } catch {
    payload = null;
  }
  const quoteSummary = object(payload?.quoteSummary);
  const result = Array.isArray(quoteSummary?.result) ? object(quoteSummary.result[0]) : null;
  const financialData = object(result?.financialData);
  const balanceSheetHistoryQuarterly = object(result?.balanceSheetHistoryQuarterly);
  const statements = Array.isArray(balanceSheetHistoryQuarterly?.balanceSheetStatements)
    ? balanceSheetHistoryQuarterly.balanceSheetStatements
    : [];

  return {
    status: response.status,
    error: quoteSummary?.error ?? payload,
    financialData: selectedQuoteFields(financialData, /debt|cash|currency/i),
    quarterlyBalanceSheets: statements.map((statement) => ({
      endDate: selectedQuoteFields(statement, /^endDate$/i).endDate ?? null,
      fields: selectedQuoteFields(statement, /debt|cash|borrow|lease/i),
    })),
  };
}

liveDescribe("live Yahoo debt fingerprint", () => {
  it("traces raw debt concepts against canonical balance-sheet periods", async () => {
    const rows: Array<Record<string, unknown>> = [];

    for (const ticker of DEBT_GAP_TICKERS) {
      const candidates = await searchCompanies(ticker);
      const company = candidates.find((candidate) =>
        (candidate.canonicalTicker ?? candidate.ticker).toUpperCase() === ticker
      );
      expect(company, `Expected exact candidate for ${ticker}`).toBeTruthy();
      if (!company) continue;

      const symbol = (company.canonicalTicker ?? company.ticker).toUpperCase();
      const [raw, quoteSummary, yahoo] = await Promise.all([
        rawYahooDebt(symbol),
        rawYahooQuoteSummaryDebt(symbol),
        fetchYahooFundamentalsResult(company),
      ]);

      rows.push({
        ticker,
        symbol,
        rawStatus: raw.status,
        rawError: raw.error,
        quoteSummary,
        rawConcepts: Object.fromEntries(Object.entries(raw.concepts).map(([concept, facts]) => [concept, {
          count: facts.length,
          facts,
        }])),
        adapter: yahoo.ok ? {
          financialFlowPeriodBasis: yahoo.data.diagnostics?.financialFlowPeriodBasis ?? null,
          financialFlowPeriodEnd: yahoo.data.diagnostics?.financialFlowPeriodEnd ?? null,
          balanceSheetPeriodEnd: yahoo.data.diagnostics?.balanceSheetPeriodEnd ?? null,
          annual: (yahoo.data.annualPeriods ?? []).map((period) => ({
            date: period.periodEndDate,
            currency: period.currency ?? null,
            totalDebt: period.totalDebt ?? null,
            totalDebtProvenance: period.provenance?.totalDebt ?? null,
            cashAndEquivalents: period.cashAndEquivalents ?? null,
            cashProvenance: period.provenance?.cashAndEquivalents ?? null,
            totalEquity: period.totalEquity ?? null,
            ebitda: period.ebitda ?? null,
          })),
          ttm: yahoo.data.trailingTwelveMonths ? {
            date: yahoo.data.trailingTwelveMonths.periodEndDate,
            currency: yahoo.data.trailingTwelveMonths.currency ?? null,
            totalDebt: yahoo.data.trailingTwelveMonths.totalDebt ?? null,
            totalDebtProvenance: yahoo.data.trailingTwelveMonths.provenance?.totalDebt ?? null,
            cashAndEquivalents: yahoo.data.trailingTwelveMonths.cashAndEquivalents ?? null,
            cashProvenance: yahoo.data.trailingTwelveMonths.provenance?.cashAndEquivalents ?? null,
            totalEquity: yahoo.data.trailingTwelveMonths.totalEquity ?? null,
            ebitda: yahoo.data.trailingTwelveMonths.ebitda ?? null,
          } : null,
        } : {
          failure: yahoo.reason,
          diagnostic: yahoo.diagnostic,
        },
      });
    }

    console.log(`YAHOO_DEBT_FINGERPRINT ${JSON.stringify(rows)}`);
    await mkdir("artifacts/coverage-live", { recursive: true });
    await writeFile(
      "artifacts/coverage-live/yahoo-debt-fingerprint.json",
      `${JSON.stringify(rows, null, 2)}\n`,
      "utf8",
    );
    expect(rows).toHaveLength(DEBT_GAP_TICKERS.length);
  }, 240_000);
});
