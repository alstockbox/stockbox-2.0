import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const classifierPath = path.join(
  process.cwd(),
  "src/lib/data/fund-structure-classification.ts",
);
const providerPath = path.join(
  process.cwd(),
  "src/lib/data/universal-security-provider.ts",
);

describe("StockBox 3 fund-structure routing", () => {
  it("verifies ETF structure before specialist scoring and fails closed for closed-end or ambiguous funds", () => {
    expect(existsSync(classifierPath)).toBe(true);

    const classifier = readFileSync(classifierPath, "utf8");
    const provider = readFileSync(providerPath, "utf8");

    expect(classifier).toContain('structure: "exchange_traded_fund"');
    expect(classifier).toContain('structure: "closed_end_fund"');
    expect(classifier).toContain('structure: "other_fund"');
    expect(classifier).toContain("if (explicitEtf && explicitCef)");
    expect(classifier).toContain("if (explicitCef)");
    expect(classifier).toContain("if (explicitEtf)");
    expect(classifier).toMatch(/closed[-\\s]?end|closed-end/i);
    expect(classifier).toMatch(/trust/i);

    expect(provider).toContain('from "./fund-structure-classification"');
    expect(provider).toContain("const fundStructure = classifyFundStructure({");
    expect(provider).toContain('if (fundStructure.structure !== "exchange_traded_fund")');
    expect(provider).toContain("Closed-end fund specialist analysis is not yet available for this security.");
    expect(provider).toContain("Fund structure could not be verified well enough to select a specialist model.");

    const structureGateIndex = provider.indexOf('if (fundStructure.structure !== "exchange_traded_fund")');
    const etfAnalysisIndex = provider.indexOf("const analysis = analyzeEtf(input)");
    expect(structureGateIndex).toBeGreaterThan(-1);
    expect(etfAnalysisIndex).toBeGreaterThan(structureGateIndex);
  });
});
