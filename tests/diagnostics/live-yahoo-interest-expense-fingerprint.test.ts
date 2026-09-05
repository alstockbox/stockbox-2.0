import { describe, expect, it } from "vitest";
import { searchCompanies } from "../../src/lib/data/provider";
import { fetchYahooFundamentalsResult } from "../../src/lib/data/yahoo-fundamentals";

const liveDescribe = process.env.RUN_LIVE_COVERAGE === "1" ? describe : describe.skip;

const INTEREST_GAP_TICKERS = [
  "KARE.AT", "ERG.AX", "GTT.PA", "CASH3.SA", "BEX.V", "AAPL", "SHOP",
] as const;

const INTEREST_RECONCILIATION_SYMBOLS = [
  "AAPL", "MSFT", "NVDA", "KO", "SBUX", "KARE.AT", "ERG.AX", "GTT.PA",
  "CASH3.SA", "SHOP", "PXT.TO", "NOVO-B.CO", "005930.KS", "TSM", "SAP.DE", "BHP.AX",
] as const;

const INTEREST_TYPES = [
  "annualInterestExpense",
  "trailingInterestExpense",
  "annualInterestExpenseNonOperating",
  "trailingInterestExpenseNonOperating",
  "annualNetNonOperatingInterestIncomeExpense",
  "trailingNetNonOperatingInterestIncomeExpense",
  "annualInterestIncomeNonOperating",
  "trailingInterestIncomeNonOperating",
  "annualOtherNonOperatingIncomeExpenses",
  "trailingOtherNonOperatingIncomeExpenses",
  "annualTotalOtherFinanceCost",
  "trailingTotalOtherFinanceCost",
] as const;

type JsonObject = Record<string, unknown>;
type RawFact = {
  date: string;
  periodType: string | null;
  value: number | null;
  currency: string | null;
};

function object(value: unknown): JsonObject | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : null;
}

async function rawYahooInterest(symbol: string) {
  const url = new URL(`https://query2.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(symbol)}`);
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("type", INTEREST_TYPES.join(","));
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

function factsByDate(raw: Awaited<ReturnType<typeof rawYahooInterest>>, concept: string) {
  return new Map((raw.concepts[concept] ?? []).map((fact) => [fact.date, fact]));
}

function relativeError(left: number, right: number) {
  return Math.abs(left - right) / Math.max(Math.abs(left), Math.abs(right), 1);
}

liveDescribe("live Yahoo interest-expense fingerprint", () => {
  it("traces raw interest-expense concepts against canonical Yahoo periods", async () => {
    const rows: Array<Record<string, unknown>> = [];

    for (const ticker of INTEREST_GAP_TICKERS) {
      const candidates = await searchCompanies(ticker);
      const company = candidates.find((candidate) =>
        (candidate.canonicalTicker ?? candidate.ticker).toUpperCase() === ticker
      );
      expect(company, `Expected exact candidate for ${ticker}`).toBeTruthy();
      if (!company) continue;
      const symbol = (company.canonicalTicker ?? company.ticker).toUpperCase();
      const [raw, yahoo] = await Promise.all([
        rawYahooInterest(symbol),
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
          currencies: facts.map((fact) => fact.currency),
        }])),
        adapter: yahoo.ok ? {
          annual: annual.map((period) => ({
            date: period.periodEndDate,
            operatingIncome: period.operatingIncome ?? null,
            interestExpense: period.interestExpense ?? null,
            interestProvenance: period.provenance?.interestExpense ?? null,
          })),
          ttm: yahoo.data.trailingTwelveMonths ? {
            date: yahoo.data.trailingTwelveMonths.periodEndDate,
            operatingIncome: yahoo.data.trailingTwelveMonths.operatingIncome ?? null,
            interestExpense: yahoo.data.trailingTwelveMonths.interestExpense ?? null,
            interestProvenance: yahoo.data.trailingTwelveMonths.provenance?.interestExpense ?? null,
          } : null,
        } : { failure: yahoo.reason, diagnostic: yahoo.diagnostic },
      });
    }

    console.log(`YAHOO_INTEREST_EXPENSE_FINGERPRINT ${JSON.stringify(rows)}`);
    expect(rows).toHaveLength(INTEREST_GAP_TICKERS.length);
  }, 240_000);

  it("reconciles the Yahoo net-interest identity against directly reported interest expense", async () => {
    const rows: Array<Record<string, unknown>> = [];
    let directComparisonCount = 0;

    for (const symbol of INTEREST_RECONCILIATION_SYMBOLS) {
      const raw = await rawYahooInterest(symbol);
      const direct = factsByDate(raw, "annualInterestExpense");
      const nonOperatingDirect = factsByDate(raw, "annualInterestExpenseNonOperating");
      const income = factsByDate(raw, "annualInterestIncomeNonOperating");
      const net = factsByDate(raw, "annualNetNonOperatingInterestIncomeExpense");
      const financeCost = factsByDate(raw, "annualTotalOtherFinanceCost");
      const dates = [...new Set([
        ...direct.keys(), ...nonOperatingDirect.keys(), ...income.keys(), ...net.keys(), ...financeCost.keys(),
      ])].sort();

      const periods = dates.flatMap((date) => {
        const directFact = direct.get(date);
        const nonOperatingDirectFact = nonOperatingDirect.get(date);
        const incomeFact = income.get(date);
        const netFact = net.get(date);
        const financeCostFact = financeCost.get(date);
        const canDerive = incomeFact?.value !== null && incomeFact?.value !== undefined
          && netFact?.value !== null && netFact?.value !== undefined
          && incomeFact.currency
          && incomeFact.currency === netFact.currency;
        const derived = canDerive ? incomeFact.value! - netFact.value! : null;
        const reported = directFact?.value ?? null;
        if (reported !== null && derived !== null) directComparisonCount += 1;
        return [{
          date,
          currency: incomeFact?.currency ?? netFact?.currency ?? directFact?.currency ?? null,
          reportedInterestExpense: reported,
          reportedInterestExpenseNonOperating: nonOperatingDirectFact?.value ?? null,
          interestIncomeNonOperating: incomeFact?.value ?? null,
          netNonOperatingInterestIncomeExpense: netFact?.value ?? null,
          derivedInterestExpense: derived,
          derivedNonNegative: derived === null ? null : derived >= 0,
          directRelativeError: reported !== null && derived !== null ? relativeError(reported, derived) : null,
          totalOtherFinanceCost: financeCostFact?.value ?? null,
        }];
      });

      rows.push({ symbol, status: raw.status, periods });
    }

    console.log(`YAHOO_INTEREST_IDENTITY_RECONCILIATION ${JSON.stringify(rows)}`);
    expect(directComparisonCount).toBeGreaterThan(10);
  }, 240_000);
});
