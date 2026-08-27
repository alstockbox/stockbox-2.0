import { describe, expect, it } from "vitest";
import { fetchYahooFundamentalsResult } from "../../src/lib/data/yahoo-fundamentals";
import { fundamentalsCoverageProfile } from "../../src/lib/data/provider";

const company = {
  ticker: "ADYEN.AS",
  canonicalTicker: "ADYEN.AS",
  name: "Adyen N.V.",
  country: "Netherlands",
  securityType: "Common Stock" as const,
  entityId: "listing:unknown:ADYEN.AS",
};

describe("ADYEN Yahoo fundamentals stability diagnostic", () => {
  it("captures repeated provider coverage", async () => {
    const runs = [];
    for (let index = 0; index < 6; index += 1) {
      const result = await fetchYahooFundamentalsResult(company);
      runs.push(result.ok ? {
        ok: true,
        coverage: fundamentalsCoverageProfile(result.data),
        annualPeriods: result.data.annualPeriods?.length ?? 0,
        ttm: Boolean(result.data.trailingTwelveMonths),
        reportingCurrency: result.data.reportingCurrency ?? result.data.trailingTwelveMonths?.currency ?? null,
        diagnostic: result.diagnostic,
      } : { ok: false, reason: result.reason, diagnostic: result.diagnostic });
    }
    console.log(`ADYEN_STABILITY=${JSON.stringify(runs)}`);
    expect(runs).toHaveLength(6);
  }, 120_000);
});
