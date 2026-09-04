import { describe, expect, it } from "vitest";
import type { CompanyFundamentals, FinancialPeriod } from "../../src/lib/analysis/types";
import { searchCompanies } from "../../src/lib/data/provider";
import { fetchCompanyFundamentalsResult } from "../../src/lib/data/sec";
import { fetchYahooFundamentalsResult } from "../../src/lib/data/yahoo-fundamentals";

const liveDescribe = process.env.RUN_LIVE_COVERAGE === "1" ? describe : describe.skip;
const PROBE_TICKERS = ["AAPL", "NVDA", "SBUX", "MSFT", "KO", "SHOP"] as const;
const FIELDS = [
  "revenue",
  "grossProfit",
  "operatingIncome",
  "netIncome",
  "operatingCashFlow",
  "capitalExpenditures",
  "cashAndEquivalents",
  "totalDebt",
  "totalEquity",
  "totalAssets",
  "stockBasedCompensation",
] as const satisfies ReadonlyArray<keyof FinancialPeriod>;

function fingerprint(period: FinancialPeriod | null | undefined) {
  if (!period) return null;
  const availableFields = FIELDS.filter((field) => {
    const value = period[field];
    return typeof value === "number" && Number.isFinite(value);
  });
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
  return {
    annual: (fundamentals.annualPeriods ?? []).map(fingerprint),
    ttm: fingerprint(fundamentals.trailingTwelveMonths),
  };
}

liveDescribe("live SEC/Yahoo period alignment diagnostic", () => {
  it("captures provider period identity and field completeness before resolver merging", async () => {
    const rows: Array<Record<string, unknown>> = [];

    for (const ticker of PROBE_TICKERS) {
      const candidates = await searchCompanies(ticker);
      const company = candidates.find((candidate) =>
        (candidate.canonicalTicker ?? candidate.ticker).toUpperCase() === ticker
      );
      expect(company, `Expected exact candidate for ${ticker}`).toBeTruthy();
      if (!company) continue;

      const [sec, yahoo] = await Promise.all([
        fetchCompanyFundamentalsResult(company),
        fetchYahooFundamentalsResult(company),
      ]);

      rows.push({
        ticker,
        cik: company.cik ?? null,
        sec: sec.ok ? providerFingerprint(sec.data) : { failure: sec.reason, diagnostic: sec.diagnostic },
        yahoo: yahoo.ok ? providerFingerprint(yahoo.data) : { failure: yahoo.reason, diagnostic: yahoo.diagnostic },
      });
    }

    console.log(`SEC_YAHOO_PERIOD_FINGERPRINT ${JSON.stringify(rows)}`);
    expect(rows).toHaveLength(PROBE_TICKERS.length);
  }, 180_000);
});
