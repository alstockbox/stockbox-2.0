import { describe, expect, it } from "vitest";
import { classifyUniversalSecurity } from "../../src/lib/analysis/universal-security";

describe("universal security ETF classification regressions", () => {
  it("does not confuse short-duration fixed-income wording with an inverse ETF", () => {
    const result = classifyUniversalSecurity({
      company: {
        ticker: "SPSB",
        name: "SPDR Portfolio Short Term Corporate Bond ETF",
        securityType: "ETF/Fund",
      },
      quoteType: "ETF",
      category: "Short-Term Bond",
    });

    expect(result.kind).toBe("bond_etf");
  });

  it("still classifies explicit short/inverse equity products as leveraged or inverse", () => {
    const result = classifyUniversalSecurity({
      company: {
        ticker: "SH",
        name: "ProShares Short S&P500 ETF",
        securityType: "ETF/Fund",
      },
      quoteType: "ETF",
      category: "Trading--Inverse Equity",
    });

    expect(result.kind).toBe("leveraged_inverse_etf");
  });
});
