import { describe, expect, it } from "vitest";
import { classifyUniversalSecurity } from "../../src/lib/analysis/universal-security";

describe("universal security BDC routing boundary", () => {
  it("does not route a business development company into the investment-company NAV/SOTP model", () => {
    const classification = classifyUniversalSecurity({
      company: {
        ticker: "ARCC",
        name: "Ares Capital Corporation Business Development Company",
        securityType: "Common Stock",
      },
      analysisArchetype: "unknown",
      industry: "Business Development Company",
      sector: "Financial Services",
    });

    expect(classification.kind).not.toBe("investment_company");
    expect(classification.analysisArchetype).not.toBe("holding_company");
  });
});
