import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Yahoo annual-history diagnostic wiring", () => {
  it("applies the provider-limit gate before canonical analysis", () => {
    const source = readFileSync("src/lib/data/provider-core.ts", "utf8");

    expect(source).toContain('import { annualHistoryProviderLimitDiagnostic } from "./provider-history-diagnostics";');
    expect(source).toContain("const annualHistoryLimitDiagnostic = annualHistoryProviderLimitDiagnostic({");
    expect(source).toContain("selectedFundamentalsProvider: fundamentalsResult.ok ? fundamentalsResult.diagnostic.provider : null");
    expect(source).toContain("if (annualHistoryLimitDiagnostic) providerDiagnostics.push(annualHistoryLimitDiagnostic);");

    const diagnosticIndex = source.indexOf("const annualHistoryLimitDiagnostic = annualHistoryProviderLimitDiagnostic({");
    const canonicalIndex = source.indexOf("const canonicalInput = toFinancialAnalysisInput(legacyInput);");
    expect(diagnosticIndex).toBeGreaterThan(-1);
    expect(canonicalIndex).toBeGreaterThan(diagnosticIndex);
  });
});
