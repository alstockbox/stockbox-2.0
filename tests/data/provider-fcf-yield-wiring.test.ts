import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("provider FCF yield FX wiring", () => {
  it("enriches regional fundamentals before market enrichment and canonical analysis", () => {
    const source = readFileSync("src/lib/data/provider-core.ts", "utf8");

    expect(source).toContain('import { enrichFundamentalsWithEcbFcfYield } from "./fcf-yield-fx";');
    expect(source).toContain("const rawFundamentals = fundamentalsResult.ok ? fundamentalsResult.data : null;");
    expect(source).toContain("const regionalFundamentals = cvmEnrichment?.fundamentals ?? rawFundamentals;");
    expect(source).toContain("const fundamentals = regionalFundamentals ? await enrichFundamentalsWithEcbFcfYield(regionalFundamentals) : null;");
    expect(source).toContain("const market = enrichMarketWithFundamentals(company, rawMarket, fundamentals, accessedAt);");

    const rawIndex = source.indexOf("const rawFundamentals = fundamentalsResult.ok ? fundamentalsResult.data : null;");
    const regionalIndex = source.indexOf("const regionalFundamentals = cvmEnrichment?.fundamentals ?? rawFundamentals;");
    const enrichmentIndex = source.indexOf("const fundamentals = regionalFundamentals ? await enrichFundamentalsWithEcbFcfYield(regionalFundamentals) : null;");
    const marketIndex = source.indexOf("const market = enrichMarketWithFundamentals(company, rawMarket, fundamentals, accessedAt);");
    const legacyIndex = source.indexOf("const legacyInput = {");
    const canonicalIndex = source.indexOf("const canonicalInput = toFinancialAnalysisInput(legacyInput);");

    expect(rawIndex).toBeGreaterThan(-1);
    expect(regionalIndex).toBeGreaterThan(rawIndex);
    expect(enrichmentIndex).toBeGreaterThan(regionalIndex);
    expect(marketIndex).toBeGreaterThan(enrichmentIndex);
    expect(legacyIndex).toBeGreaterThan(marketIndex);
    expect(canonicalIndex).toBeGreaterThan(legacyIndex);
  });
});
