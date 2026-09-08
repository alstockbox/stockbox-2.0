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
    const providerSource = readFileSync("src/lib/data/provider.ts", "utf8");
    const fxSource = readFileSync("src/lib/data/depositary-receipt-provider-fx.ts", "utf8");

    expect(providerSource).toContain('from "./depositary-receipt-provider-fx"');
    expect(providerSource).toContain("resolveDepositaryReceiptFxContext(analysisCompany, market)");
    expect(providerSource).toContain("depositaryReceiptFxSource(depositaryReceiptFxContext, accessedAt)");
    expect(providerSource).toMatch(/gateDepositaryReceiptValuationInputs\([\s\S]*?depositaryReceiptFxContext[\s\S]*?\)/);

    expect(fxSource).toContain('from "./depositary-receipt-fx"');
    expect(fxSource).toContain('from "./ecb-fx"');
    expect(fxSource).toContain("buildDepositaryReceiptFxRequest(company, market)");
    expect(fxSource).toContain("resolveComparisonFxContexts(");
    expect(fxSource).toContain("request.targetCurrency");
    expect(fxSource).toContain("contexts.get(request.id)");
    expect(fxSource).toContain('context.status !== "normalized"');
    expect(fxSource).toContain("provider: context.provider");
    expect(fxSource).toContain("dataAsOf: context.rateDate");
  });

  it("reconciles the normalized ADR quote against its verified primary listing and fails valuation closed on material conflict", () => {
    const source = readFileSync("src/lib/data/provider.ts", "utf8");

    expect(source).toContain('from "./depositary-receipt-primary-listing"');
    expect(source).toContain("buildDepositaryReceiptPrimaryListingCompany(");
    expect(source).toContain("resolveConfiguredMarketData(primaryListingCompany)");
    expect(source).toContain("reconcileDepositaryReceiptPrimaryListingPrice(");
    expect(source).toContain('primaryListingReconciliation.status === "conflict"');
    expect(source).toContain("disableDepositaryReceiptValuationInputs(");

    expect(source).toMatch(/const\s+legacyInput\s*=\s*\{[\s\S]*?market,[\s\S]*?fundamentals,/);
    expect(source).toMatch(/toFinancialAnalysisInput\(\{[\s\S]*?market:\s*valuationInputs\.market,[\s\S]*?fundamentals:\s*valuationInputs\.fundamentals/);
  });
});
