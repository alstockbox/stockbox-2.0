import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("provider depositary-receipt wiring", () => {
  it("attaches verified ADR representation before eligibility and gates only canonical valuation inputs", () => {
    const source = readFileSync("src/lib/data/provider.ts", "utf8");

    expect(source).toContain('from "./depositary-receipt-registry"');
    expect(source).toContain('from "./depositary-receipt"');
    expect(source).toContain("attachVerifiedDepositaryReceiptRepresentation(company)");
    expect(source).toContain("gateDepositaryReceiptValuationInputs(");

    expect(source).toMatch(/const\s+legacyInput\s*=\s*\{[\s\S]*?market,[\s\S]*?fundamentals,/);
    expect(source).toMatch(/toFinancialAnalysisInput\(\{[\s\S]*?\.\.\.legacyInput,[\s\S]*?market:\s*valuationInputs\.market,[\s\S]*?fundamentals:\s*valuationInputs\.fundamentals/);
    expect(source).toContain("if (valuationInputs.warning) warnings.push(valuationInputs.warning)");
  });

  it("resolves ECB FX only through the verified cross-currency ADR request gate and preserves provenance", () => {
    const source = readFileSync("src/lib/data/provider.ts", "utf8");

    expect(source).toContain('from "./depositary-receipt-fx"');
    expect(source).toContain('from "./ecb-fx"');
    expect(source).toContain("buildDepositaryReceiptFxRequest(company, market)");
    expect(source).toContain("resolveComparisonFxContexts(");
    expect(source).toContain("request.targetCurrency");
    expect(source).toContain("contexts.get(request.id)");
    expect(source).toMatch(/gateDepositaryReceiptValuationInputs\([\s\S]*?depositaryReceiptFxContext[\s\S]*?\)/);
    expect(source).toContain('depositaryReceiptFxContext.status === "normalized"');
    expect(source).toContain("provider: depositaryReceiptFxContext.provider");
    expect(source).toContain("dataAsOf: depositaryReceiptFxContext.rateDate");
  });
});
