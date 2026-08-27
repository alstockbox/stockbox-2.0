import { describe, expect, it } from "vitest";
import { adminQaSections } from "../../src/components/analysis/admin-qa";
import type { AdminQaDiagnostics } from "../../src/lib/analysis";

const diagnostics: AdminQaDiagnostics = {
  providerAttempts: [{ provider: "sec-companyfacts", capability: "fundamentals", status: "available", observedAt: "2026-08-20T00:00:00.000Z" }],
  selectedProviders: ["sec-companyfacts"],
  providerFailures: [{ provider: "primary-market", capability: "market_data", status: "unavailable", reason: "Timed out.", observedAt: "2026-08-20T00:00:00.000Z" }],
  fallbacks: ["yahoo-chart"],
  missingDataReasons: [],
  classificationDiagnostics: { reason: "Industry classification.", source: "description", confidence: 0.9, ambiguous: false, candidates: ["software_growth"] },
  timingsMs: { total: 125 },
  sourceConflicts: [],
  currencyState: "aligned",
  specializedCoverage: 1,
  valuationSupport: "directional",
};

describe("admin analysis QA diagnostics", () => {
  it("formats the operational diagnostics included by the admin API", () => {
    const sections = adminQaSections(diagnostics);
    expect(sections).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "Selected providers", values: ["sec-companyfacts"] }),
      expect.objectContaining({ label: "Fallbacks", values: ["yahoo-chart"] }),
      expect.objectContaining({ label: "Provider failures", values: ["primary-market / market_data: Timed out."] }),
      expect.objectContaining({ label: "Currency", values: ["aligned"] }),
      expect.objectContaining({ label: "Valuation support", values: ["directional"] }),
    ]));
  });

  it("returns no admin panel content when the server stripped adminQa", () => {
    expect(adminQaSections(undefined)).toEqual([]);
  });
});

it("renders non-specialist coverage as not applicable in admin QA", () => {
  const sections = adminQaSections({ ...diagnostics, specializedCoverage: null });
  expect(sections).toEqual(expect.arrayContaining([
    expect.objectContaining({ label: "Specialized coverage", values: ["Not applicable"] }),
  ]));
});
