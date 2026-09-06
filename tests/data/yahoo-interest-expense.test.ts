import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CompanySearchResult } from "../../src/lib/analysis/types";
import { fetchYahooFundamentalsResult } from "../../src/lib/data/yahoo-fundamentals";

const company: CompanySearchResult = {
  ticker: "TEST.AX",
  canonicalTicker: "TEST.AX",
  name: "Test Company",
  exchange: "Australian",
  country: "Australia",
  currency: "AUD",
  securityType: "Common Stock",
};

type FactInput = {
  type: string;
  value: number;
  date?: string;
  currency?: string;
  periodType?: string;
};

function series(
  type: string,
  value: number,
  date = "2025-12-31",
  currency = "AUD",
  periodType = "12M",
) {
  return {
    meta: { symbol: ["TEST.AX"], type: [type] },
    [type]: [{
      asOfDate: date,
      periodType,
      currencyCode: currency,
      reportedValue: { raw: value, fmt: String(value) },
    }],
  };
}

function timeseriesPayload(facts: FactInput[]) {
  const anchors: FactInput[] = [
    { type: "annualTotalRevenue", value: 1_000 },
    { type: "annualNetIncome", value: 80 },
    { type: "annualTotalAssets", value: 2_000 },
  ];
  return {
    timeseries: {
      result: [...anchors, ...facts].map((fact) => series(
        fact.type,
        fact.value,
        fact.date ?? "2025-12-31",
        fact.currency ?? "AUD",
        fact.periodType ?? "12M",
      )),
    },
  };
}

function installYahooMock(facts: FactInput[]) {
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes("/ws/fundamentals-timeseries/")) {
      const requestedTypes = new Set(new URL(url).searchParams.get("type")?.split(",") ?? []);
      const requestedFacts = facts.filter((fact) => requestedTypes.has(fact.type));
      return new Response(JSON.stringify(timeseriesPayload(requestedFacts)), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.includes("/v1/finance/search")) {
      return new Response(JSON.stringify({
        quotes: [{
          symbol: "TEST.AX",
          quoteType: "EQUITY",
          longname: "Test Company",
          exchDisp: "Australian",
          country: "Australia",
          currency: "AUD",
          sector: "Industrials",
          industry: "Industrial Distribution",
        }],
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    throw new Error(`Unexpected Yahoo request: ${url}`);
  }));
}

async function latestAnnual(facts: FactInput[]) {
  installYahooMock(facts);
  const result = await fetchYahooFundamentalsResult(company);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.message);
  const period = result.data.annualPeriods?.at(-1);
  expect(period).toBeDefined();
  if (!period) throw new Error("Expected annual period");
  return period;
}

function verifiedHistoricalInterestEvidence(): FactInput[] {
  return [
    { type: "annualInterestExpense", value: 40, date: "2023-12-31" },
    { type: "annualInterestIncomeNonOperating", value: 10, date: "2023-12-31" },
    { type: "annualNetNonOperatingInterestIncomeExpense", value: -30, date: "2023-12-31" },
    { type: "annualInterestExpenseNonOperating", value: 45, date: "2024-12-31" },
    { type: "annualInterestIncomeNonOperating", value: 8, date: "2024-12-31" },
    { type: "annualNetNonOperatingInterestIncomeExpense", value: -37, date: "2024-12-31" },
  ];
}

function currentInterestComponents(overrides: Partial<FactInput> = {}): FactInput[] {
  return [
    { type: "annualInterestIncomeNonOperating", value: 9, ...overrides },
    { type: "annualNetNonOperatingInterestIncomeExpense", value: -33, ...overrides },
  ];
}

describe("Yahoo interest expense semantics", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("keeps direct InterestExpense ahead of every fallback or derivation", async () => {
    const period = await latestAnnual([
      ...verifiedHistoricalInterestEvidence(),
      ...currentInterestComponents(),
      { type: "annualInterestExpense", value: 50 },
      { type: "annualInterestExpenseNonOperating", value: 42 },
    ]);

    expect(period.interestExpense).toBe(50);
    expect(period.provenance?.interestExpense).toMatchObject({
      concept: "annualInterestExpense",
      valueKind: "reported",
    });
  });

  it("uses InterestExpenseNonOperating as a reported fallback when InterestExpense is unavailable", async () => {
    const period = await latestAnnual([
      ...verifiedHistoricalInterestEvidence(),
      ...currentInterestComponents(),
      { type: "annualInterestExpenseNonOperating", value: 42 },
    ]);

    expect(period.interestExpense).toBe(42);
    expect(period.provenance?.interestExpense).toMatchObject({
      provider: "yahoo-fundamentals",
      concept: "annualInterestExpenseNonOperating",
      valueKind: "reported",
      periodEnd: "2025-12-31",
      unit: "AUD",
    });
  });

  it("derives interest expense from current components only after two historical periods reconcile", async () => {
    const period = await latestAnnual([
      ...verifiedHistoricalInterestEvidence(),
      ...currentInterestComponents(),
    ]);

    expect(period.interestExpense).toBe(42);
  });

  it("marks evidence-gated component derivation as derived provenance", async () => {
    const period = await latestAnnual([
      ...verifiedHistoricalInterestEvidence(),
      ...currentInterestComponents(),
    ]);

    expect(period.provenance?.interestExpense).toMatchObject({
      provider: "yahoo-fundamentals",
      valueKind: "derived",
      periodEnd: "2025-12-31",
      unit: "AUD",
    });
    expect(period.provenance?.interestExpense?.inputs).toEqual(expect.arrayContaining([
      "annualInterestIncomeNonOperating@2025-12-31",
      "annualNetNonOperatingInterestIncomeExpense@2025-12-31",
      "annualInterestExpense@2023-12-31",
      "annualInterestExpenseNonOperating@2024-12-31",
    ]));
    expect(period.provenance?.interestExpense?.note).toContain("InterestIncomeNonOperating - NetNonOperatingInterestIncomeExpense");
  });

  it("blocks derivation when any comparable historical observation contradicts the formula", async () => {
    const period = await latestAnnual([
      ...verifiedHistoricalInterestEvidence(),
      { type: "annualInterestExpense", value: 25, date: "2022-12-31" },
      { type: "annualInterestIncomeNonOperating", value: 7, date: "2022-12-31" },
      { type: "annualNetNonOperatingInterestIncomeExpense", value: -8, date: "2022-12-31" },
      ...currentInterestComponents(),
    ]);

    expect(period.interestExpense).toBeNull();
    expect(period.provenance?.interestExpense).toBeUndefined();
  });

  it("blocks CASH3/SHOP-like unstable historical component relationships", async () => {
    const period = await latestAnnual([
      { type: "annualInterestExpense", value: 40, date: "2023-12-31" },
      { type: "annualInterestIncomeNonOperating", value: 10, date: "2023-12-31" },
      { type: "annualNetNonOperatingInterestIncomeExpense", value: -15, date: "2023-12-31" },
      { type: "annualInterestExpenseNonOperating", value: 45, date: "2024-12-31" },
      { type: "annualInterestIncomeNonOperating", value: 8, date: "2024-12-31" },
      { type: "annualNetNonOperatingInterestIncomeExpense", value: -20, date: "2024-12-31" },
      ...currentInterestComponents(),
    ]);

    expect(period.interestExpense).toBeNull();
  });

  it("blocks derivation when current components use different currencies", async () => {
    const period = await latestAnnual([
      ...verifiedHistoricalInterestEvidence(),
      { type: "annualInterestIncomeNonOperating", value: 9, currency: "AUD" },
      { type: "annualNetNonOperatingInterestIncomeExpense", value: -33, currency: "USD" },
    ]);

    expect(period.interestExpense).toBeNull();
  });

  it("blocks derivation when current components do not share the selected period date", async () => {
    const period = await latestAnnual([
      ...verifiedHistoricalInterestEvidence(),
      { type: "annualInterestIncomeNonOperating", value: 9 },
      { type: "annualNetNonOperatingInterestIncomeExpense", value: -33, date: "2025-12-30" },
    ]);

    expect(period.interestExpense).toBeNull();
  });

  it("blocks derivation when fewer than two historical observations reconcile", async () => {
    const period = await latestAnnual([
      { type: "annualInterestExpense", value: 40, date: "2024-12-31" },
      { type: "annualInterestIncomeNonOperating", value: 10, date: "2024-12-31" },
      { type: "annualNetNonOperatingInterestIncomeExpense", value: -30, date: "2024-12-31" },
      ...currentInterestComponents(),
    ]);

    expect(period.interestExpense).toBeNull();
  });

  it("never overwrites a current reported fallback with a conflicting derived value", async () => {
    const period = await latestAnnual([
      ...verifiedHistoricalInterestEvidence(),
      { type: "annualInterestIncomeNonOperating", value: 12 },
      { type: "annualNetNonOperatingInterestIncomeExpense", value: -38 },
      { type: "annualInterestExpenseNonOperating", value: 42 },
    ]);

    expect(period.interestExpense).toBe(42);
    expect(period.provenance?.interestExpense).toMatchObject({
      concept: "annualInterestExpenseNonOperating",
      valueKind: "reported",
    });
  });
});
