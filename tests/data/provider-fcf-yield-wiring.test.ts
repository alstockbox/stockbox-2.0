import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("provider FCF yield FX wiring", () => {
  it("enriches raw fundamentals before market enrichment and canonical analysis", () => {
    const source = readFileSync("src/lib/data/provider-core.ts", "utf8");

    expect(source).toContain('import { enrichFundamentalsWithEcbFcfYield } from "./fcf-yield-fx";');
    expect(source).toContain("const rawFundamentals = fundamentalsResult.ok ? fundamentalsResult.data : null;");
    expect(source).toContain("const fundamentals = rawFundamentals ? await enrichFundamentalsWithEcbFcfYield(rawFundamentals) : null;");
    expect(source).toContain("const market = enrichMarketWithFundamentals(company, rawMarket, fundamentals, accessedAt);");

    const rawIndex = source.indexOf("const rawFundamentals = fundamentalsResult.ok ? fundamentalsResult.data : null;");
    const enrichmentIndex = source.indexOf("const fundamentals = rawFundamentals ? await enrichFundamentalsWithEcbFcfYield(rawFundamentals) : null;");
    const marketIndex = source.indexOf("const market = enrichMarketWithFundamentals(company, rawMarket, fundamentals, accessedAt);");
    const legacyIndex = source.indexOf("const legacyInput = {");
    const canonicalIndex = source.indexOf("const canonicalInput = toFinancialAnalysisInput(legacyInput);");

    expect(rawIndex).toBeGreaterThan(-1);
    expect(enrichmentIndex).toBeGreaterThan(rawIndex);
    expect(marketIndex).toBeGreaterThan(enrichmentIndex);
    expect(legacyIndex).toBeGreaterThan(marketIndex);
    expect(canonicalIndex).toBeGreaterThan(legacyIndex);
  });
});
