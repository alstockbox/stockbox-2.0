import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { CompanySearchResult, ProviderDiagnostic } from "../../src/lib/analysis/types";
import { classifyAnalysisFailure } from "../../scripts/diagnostics/user-large-ticker-classification";

const etf = {
  ticker: "SPY",
  canonicalTicker: "SPY",
  name: "SPDR S&P 500 ETF Trust",
  securityType: "ETF/Fund",
} as CompanySearchResult;

function specializedUnavailable(): ProviderDiagnostic[] {
  return [{
    provider: "ETF provider chain",
    capability: "specialized",
    status: "unavailable",
    reason: "not_configured",
    observedAt: "2026-09-07T18:30:00.000Z",
  }];
}

describe("large ticker audit universal-security routing", () => {
  it("runs the live corpus through the universal-security provider instead of the legacy fundamentals-only provider", () => {
    const source = readFileSync("scripts/diagnostics/user-large-ticker-audit.test.ts", "utf8");

    expect(source).toContain('from "../../src/lib/data/universal-security-live-provider"');
    expect(source).not.toContain('from "../../src/lib/data/provider"');
  });

  it("classifies supported ETF specialist-data failures as provider gaps rather than unsupported funds", () => {
    const classification = classifyAnalysisFailure(
      "ETF-specific metadata is unavailable for this security.",
      etf,
      specializedUnavailable(),
    );

    expect(classification.status).toBe("provider_failure");
    expect(classification.rootCauses).toEqual(expect.arrayContaining([
      "provider_failure",
      "provider_not_configured",
    ]));
    expect(classification.rootCauses).not.toContain("unsupported_security");
    expect(classification.rootCauses).not.toContain("fund_or_etf_unsupported");
  });

  it("keeps an explicitly unsupported closed-end fund outside the ETF specialist denominator", () => {
    const closedEndFund = {
      ...etf,
      ticker: "PDI",
      canonicalTicker: "PDI",
      name: "PIMCO Dynamic Income Fund",
    } as CompanySearchResult;

    expect(classifyAnalysisFailure(
      "Closed-end fund specialist analysis is not yet available for this security.",
      closedEndFund,
      [],
    )).toEqual({
      status: "unsupported",
      rootCauses: ["unsupported_security", "fund_or_etf_unsupported"],
    });
  });
});
