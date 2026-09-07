import { mkdir, writeFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { searchCompanies } from "../../src/lib/data/provider";
import { fetchCompanyFundamentalsResult } from "../../src/lib/data/sec";
import { padCik } from "../../src/lib/data/sec-core";

type JsonObject = Record<string, unknown>;
type RawFact = {
  start?: string;
  end?: string;
  fy?: number;
  fp?: string;
  form?: string;
  filed?: string;
  accn?: string;
  frame?: string;
  val?: number;
};

const liveDescribe = process.env.RUN_LIVE_COVERAGE === "1" ? describe : describe.skip;
const TARGETS = ["MSFT", "KO", "NVDA", "SHOP", "BF-B", "COSM"] as const;
const DEBT_CONCEPT_PATTERN = /(Debt|Borrow|CommercialPaper|FinanceLease|CapitalLease|Loan|Notes?Payable)/i;
const MIN_END = "2024-01-01";

function object(value: unknown): JsonObject | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : null;
}

function canonicalPeriods(result: Awaited<ReturnType<typeof fetchCompanyFundamentalsResult>>) {
  if (!result.ok) return { failure: result.reason, diagnostic: result.diagnostic };
  const summarize = (period: NonNullable<typeof result.data.trailingTwelveMonths>) => ({
    date: period.periodEndDate ?? null,
    balanceSheetDate: period.balanceSheetDate ?? null,
    basis: period.periodBasis ?? null,
    currency: period.currency ?? null,
    debt: period.totalDebt ?? null,
    debtProvenance: period.provenance?.totalDebt ?? null,
    cash: period.cashAndEquivalents ?? null,
    equity: period.totalEquity ?? null,
  });
  return {
    annual: (result.data.annualPeriods ?? []).map(summarize),
    ttm: result.data.trailingTwelveMonths ? summarize(result.data.trailingTwelveMonths) : null,
    priorTtm: result.data.priorTrailingTwelveMonths ? summarize(result.data.priorTrailingTwelveMonths) : null,
  };
}

async function rawSecDebt(cik: string) {
  const userAgent = process.env.SEC_USER_AGENT;
  expect(userAgent, "SEC_USER_AGENT is required for live SEC diagnostics").toBeTruthy();
  const url = `https://data.sec.gov/api/xbrl/companyfacts/CIK${padCik(cik)}.json`;
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": userAgent ?? "StockBox/1.0 https://www.getstockbox.app/contact",
    },
  });
  expect(response.ok, `SEC companyfacts failed for CIK ${cik}: HTTP ${response.status}`).toBe(true);
  const payload = object(await response.json());
  const facts = object(payload?.facts);
  const rows: Array<Record<string, unknown>> = [];

  for (const [taxonomy, taxonomyValue] of Object.entries(facts ?? {})) {
    const concepts = object(taxonomyValue);
    for (const [concept, definitionValue] of Object.entries(concepts ?? {})) {
      if (!DEBT_CONCEPT_PATTERN.test(concept)) continue;
      const definition = object(definitionValue);
      const units = object(definition?.units);
      for (const [unit, unitRows] of Object.entries(units ?? {})) {
        if (!Array.isArray(unitRows)) continue;
        const recent = unitRows.flatMap((rowValue) => {
          const row = object(rowValue) as (JsonObject & RawFact) | null;
          if (!row || typeof row.end !== "string" || row.end < MIN_END) return [];
          if (typeof row.val !== "number" || !Number.isFinite(row.val)) return [];
          return [{
            start: typeof row.start === "string" ? row.start : null,
            end: row.end,
            fy: typeof row.fy === "number" ? row.fy : null,
            fp: typeof row.fp === "string" ? row.fp : null,
            form: typeof row.form === "string" ? row.form : null,
            filed: typeof row.filed === "string" ? row.filed : null,
            accn: typeof row.accn === "string" ? row.accn : null,
            frame: typeof row.frame === "string" ? row.frame : null,
            val: row.val,
          }];
        });
        if (recent.length > 0) {
          rows.push({ taxonomy, concept, unit, facts: recent });
        }
      }
    }
  }

  return rows.sort((left, right) => String(left.concept).localeCompare(String(right.concept)));
}

liveDescribe("live SEC debt concept fingerprint", () => {
  it("captures raw debt concepts beside canonical SEC periods for ROIC gaps", async () => {
    const output: Array<Record<string, unknown>> = [];

    for (const ticker of TARGETS) {
      const candidates = await searchCompanies(ticker);
      const company = candidates.find((candidate) =>
        (candidate.canonicalTicker ?? candidate.ticker).toUpperCase() === ticker
      );
      expect(company, `Expected exact candidate for ${ticker}`).toBeTruthy();
      if (!company) continue;

      const cik = company.cik ? padCik(company.cik) : null;
      const sec = await fetchCompanyFundamentalsResult(company);
      output.push({
        ticker,
        cik,
        canonical: canonicalPeriods(sec),
        rawDebtConcepts: cik ? await rawSecDebt(cik) : [],
      });
    }

    await mkdir("artifacts/coverage-live", { recursive: true });
    await writeFile(
      "artifacts/coverage-live/sec-debt-concepts-fingerprint.json",
      `${JSON.stringify(output, null, 2)}\n`,
      "utf8",
    );
    console.log(`SEC_DEBT_CONCEPTS_FINGERPRINT ${JSON.stringify(output)}`);
    expect(output).toHaveLength(TARGETS.length);
  }, 240_000);
});
