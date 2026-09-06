import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("provider CVM Brazil debt wiring", () => {
  it("supplements selected fundamentals before FX, market enrichment and canonical analysis", () => {
    const source = readFileSync("src/lib/data/provider-core.ts", "utf8");

    expect(source).toContain('import { enrichBrazilFundamentalsWithCvmDebt } from "./cvm-brazil-provider";');
    expect(source).toContain("const rawFundamentals = fundamentalsResult.ok ? fundamentalsResult.data : null;");
    expect(source).toContain("const cvmEnrichment = rawFundamentals");
    expect(source).toContain("? await enrichBrazilFundamentalsWithCvmDebt(company, rawFundamentals)");
    expect(source).toContain("const regionalFundamentals = cvmEnrichment?.fundamentals ?? rawFundamentals;");
    expect(source).toContain("const fundamentals = regionalFundamentals ? await enrichFundamentalsWithEcbFcfYield(regionalFundamentals) : null;");
    expect(source).toContain("...(cvmEnrichment?.diagnostic ? [cvmEnrichment.diagnostic] : []),");
    expect(source).toContain("if (cvmEnrichment?.source) {");
    expect(source).toContain("...cvmEnrichment.source,");
    expect(source).toContain("accessedAt,");

    const rawIndex = source.indexOf("const rawFundamentals = fundamentalsResult.ok ? fundamentalsResult.data : null;");
    const cvmIndex = source.indexOf("const cvmEnrichment = rawFundamentals");
    const regionalIndex = source.indexOf("const regionalFundamentals = cvmEnrichment?.fundamentals ?? rawFundamentals;");
    const fxIndex = source.indexOf("const fundamentals = regionalFundamentals ? await enrichFundamentalsWithEcbFcfYield(regionalFundamentals) : null;");
    const marketIndex = source.indexOf("const market = enrichMarketWithFundamentals(company, rawMarket, fundamentals, accessedAt);");
    const legacyIndex = source.indexOf("const legacyInput = {");
    const canonicalIndex = source.indexOf("const canonicalInput = toFinancialAnalysisInput(legacyInput);");

    expect(rawIndex).toBeGreaterThan(-1);
    expect(cvmIndex).toBeGreaterThan(rawIndex);
    expect(regionalIndex).toBeGreaterThan(cvmIndex);
    expect(fxIndex).toBeGreaterThan(regionalIndex);
    expect(marketIndex).toBeGreaterThan(fxIndex);
    expect(legacyIndex).toBeGreaterThan(marketIndex);
    expect(canonicalIndex).toBeGreaterThan(legacyIndex);
  });
});
