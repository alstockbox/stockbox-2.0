import { describe, expect, it } from "vitest";
import { searchCompanies } from "../../src/lib/data/provider";
import { fetchCompanyFundamentalsResult } from "../../src/lib/data/sec";
import {
  SEC_CONCEPTS,
  resolveAnnualFacts,
  resolveTtmFacts,
  type SecCompanyFacts,
} from "../../src/lib/data/sec-resolver";

const liveDescribe = process.env.RUN_LIVE_COVERAGE === "1" ? describe : describe.skip;

const SEC_INTEREST_SYMBOLS = ["AAPL", "SHOP", "MSFT", "KO", "SBUX"] as const;
const RAW_INTEREST_CONCEPTS = [
  "InterestExpenseNonOperating",
  "InterestExpense",
  "InterestAndDebtExpense",
  "InterestAndOtherNet",
] as const;

type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : null;
}

async function rawCompanyFacts(cik: string): Promise<SecCompanyFacts> {
  const userAgent = process.env.SEC_USER_AGENT?.trim();
  expect(userAgent, "SEC_USER_AGENT must be configured for live SEC diagnostics").toBeTruthy();
  const response = await fetch(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`, {
    headers: {
      "User-Agent": userAgent!,
      Accept: "application/json",
      "Accept-Encoding": "gzip, deflate",
    },
  });
  expect(response.ok, `Expected SEC Companyfacts for CIK ${cik}, got ${response.status}`).toBe(true);
  return await response.json() as SecCompanyFacts;
}

function rawConceptRows(facts: SecCompanyFacts, concept: string) {
  const definition = facts.facts?.["us-gaap"]?.[concept];
  const units = definition?.units ?? {};
  return Object.fromEntries(Object.entries(units).map(([unit, rows]) => [unit, (rows ?? []).map((row) => ({
    start: row.start ?? null,
    end: row.end,
    fy: row.fy ?? null,
    fp: row.fp ?? null,
    form: row.form ?? null,
    filed: row.filed ?? null,
    accn: row.accn ?? null,
    frame: row.frame ?? null,
    val: row.val,
  }))]));
}

function compactResolved(fact: ReturnType<typeof resolveTtmFacts>[number]) {
  return {
    start: fact.start ?? null,
    end: fact.end,
    fy: fact.fy ?? null,
    fp: fact.fp ?? null,
    form: fact.form ?? null,
    filed: fact.filed ?? null,
    concept: fact.concept,
    unit: fact.unit,
    val: fact.val,
    periodBasis: fact.periodBasis ?? null,
    currentYtdDurationDays: fact.currentYtdDurationDays ?? null,
    priorYtdDurationDays: fact.priorYtdDurationDays ?? null,
    ttmConstructionMethod: fact.ttmConstructionMethod ?? null,
  };
}

liveDescribe("live SEC interest-expense fingerprint", () => {
  it("traces raw SEC interest contexts through the annual and TTM resolvers", async () => {
    const rows: Array<Record<string, unknown>> = [];

    for (const ticker of SEC_INTEREST_SYMBOLS) {
      const candidates = await searchCompanies(ticker);
      const company = candidates.find((candidate) =>
        (candidate.canonicalTicker ?? candidate.ticker).toUpperCase() === ticker
      );
      expect(company?.cik, `Expected exact SEC candidate with CIK for ${ticker}`).toBeTruthy();
      if (!company?.cik) continue;
      const cik = company.cik.replace(/\D/g, "").padStart(10, "0");
      const [raw, adapter] = await Promise.all([
        rawCompanyFacts(cik),
        fetchCompanyFundamentalsResult(company),
      ]);
      const annualResolved = [...resolveAnnualFacts(raw, SEC_CONCEPTS.interestExpense).values()].map(compactResolved);
      const ttmResolved = resolveTtmFacts(raw, SEC_CONCEPTS.interestExpense).map(compactResolved);

      rows.push({
        ticker,
        cik,
        rawConcepts: Object.fromEntries(RAW_INTEREST_CONCEPTS.map((concept) => [concept, rawConceptRows(raw, concept)])),
        resolver: {
          annual: annualResolved,
          ttm: ttmResolved,
        },
        adapter: adapter.ok ? {
          annual: (adapter.data.annualPeriods ?? []).map((period) => ({
            date: period.periodEndDate,
            interestExpense: period.interestExpense ?? null,
            provenance: period.provenance?.interestExpense ?? null,
          })),
          ttm: adapter.data.trailingTwelveMonths ? {
            date: adapter.data.trailingTwelveMonths.periodEndDate,
            basis: adapter.data.trailingTwelveMonths.periodBasis ?? null,
            interestExpense: adapter.data.trailingTwelveMonths.interestExpense ?? null,
            provenance: adapter.data.trailingTwelveMonths.provenance?.interestExpense ?? null,
          } : null,
        } : {
          failure: adapter.reason,
          diagnostic: adapter.diagnostic,
        },
      });
    }

    console.log(`SEC_INTEREST_EXPENSE_FINGERPRINT ${JSON.stringify(rows)}`);
    expect(rows).toHaveLength(SEC_INTEREST_SYMBOLS.length);
  }, 240_000);
});
