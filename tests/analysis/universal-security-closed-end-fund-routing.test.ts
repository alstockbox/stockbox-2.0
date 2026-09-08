import { describe, expect, it } from "vitest";
import { classifyUniversalSecurity } from "../../src/lib/analysis/universal-security";

describe("closed-end fund routing", () => {
  it("does not route an explicit closed-end fund through the generic ETF model", () => {
    const classification = classifyUniversalSecurity({
      company: {
        ticker: "USA",
        name: "Liberty All-Star Equity Fund Closed-End Fund",
        securityType: "ETF/Fund",
      },
      quoteType: "MUTUALFUND",
      category: "Closed-End Fund",
    });

    expect(classification.kind).toBe("closed_end_fund");
    expect(classification.analysisArchetype).toBe("unknown");
    expect(classification.reason.toLowerCase()).toContain("closed-end");
  });

  it("does not misclassify an ordinary index ETF as a closed-end fund", () => {
    const classification = classifyUniversalSecurity({
      company: {
        ticker: "SPY",
        name: "SPDR S&P 500 ETF Trust",
        securityType: "ETF/Fund",
      },
      quoteType: "ETF",
      category: "Large Blend",
    });

    expect(classification.kind).toBe("index_etf");
  });
});
