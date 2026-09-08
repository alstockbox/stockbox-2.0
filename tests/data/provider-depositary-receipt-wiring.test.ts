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
});
