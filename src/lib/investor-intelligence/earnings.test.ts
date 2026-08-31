import { describe, expect, it } from "vitest";
import { buildEarningsIntelligence } from "./earnings";

describe("buildEarningsIntelligence", () => {
  it("calculates beats only when consensus exists", () => {
    const result = buildEarningsIntelligence({ reportedRevenue: 102, estimatedRevenue: 100, reportedEps: 2.1, estimatedEps: 2, operatingMargin: 0.22, priorOperatingMargin: 0.20, freeCashFlow: 50, priorFreeCashFlow: 55 });
    expect(result.revenueSurprise).toBeCloseTo(0.02);
    expect(result.epsSurprise).toBeCloseTo(0.05);
    expect(result.statements.some((statement)=>statement.includes("Operating margin"))).toBe(true);
  });

  it("does not label a beat when estimate is missing", () => {
    const result = buildEarningsIntelligence({ reportedRevenue: 102, estimatedRevenue: null, reportedEps: 2.1, estimatedEps: null, operatingMargin: null, priorOperatingMargin: null, freeCashFlow: null, priorFreeCashFlow: null });
    expect(result.revenueSurprise).toBeNull();
    expect(result.epsSurprise).toBeNull();
    expect(result.statements.join(" ").toLowerCase()).not.toContain("beat");
  });
});
