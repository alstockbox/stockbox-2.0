import { describe, expect, it } from "vitest";
import { classifyFundStructure } from "../../src/lib/data/fund-structure-classification";
import type { CompanySearchResult } from "../../src/lib/analysis/types";

function company(overrides: Partial<CompanySearchResult>): CompanySearchResult {
  return {
    ticker: "FUND",
    name: "Generic Listed Fund",
    securityType: "ETF/Fund",
    ...overrides,
  };
}

describe("fund structure classification", () => {
  it("keeps explicit exchange-traded funds on the ETF structure", () => {
    expect(classifyFundStructure({
      company: company({ ticker: "SPY", name: "State Street SPDR S&P 500 ETF Trust" }),
      quoteType: "ETF",
      category: "Large Blend",
    })).toEqual(expect.objectContaining({
      structure: "exchange_traded_fund",
      confidence: expect.any(Number),
    }));
  });

  it("recognizes UCITS ETF wording without relying on ticker hardcoding", () => {
    expect(classifyFundStructure({
      company: company({ ticker: "IUSA.L", name: "iShares VII PLC - S&P 500 UCITS ETF" }),
      quoteType: null,
      category: "US Large-Cap Blend Equity",
    }).structure).toBe("exchange_traded_fund");
  });

  it.each([
    ["Example Closed-End Fund", null, null],
    ["Listed Income Portfolio", null, "Closed-End Fund - Fixed Income"],
    ["BlackRock Multi-Sector Income Trust", null, "Multisector Bond"],
    ["The Gabelli Utility Trust", null, "Utilities"],
  ] as const)("recognizes high-confidence closed-end structure: %s", (name, quoteType, category) => {
    const result = classifyFundStructure({
      company: company({ name }),
      quoteType,
      category,
    });

    expect(result).toEqual(expect.objectContaining({
      structure: "closed_end_fund",
      confidence: expect.any(Number),
      reason: expect.stringMatching(/closed.end|trust/i),
    }));
  });

  it("does not treat an operating real-estate trust as a closed-end fund", () => {
    expect(classifyFundStructure({
      company: company({
        ticker: "DLR",
        name: "Digital Realty Trust, Inc.",
        securityType: "Common Stock",
      }),
      quoteType: "EQUITY",
      category: null,
    }).structure).toBe("not_fund");
  });

  it("does not guess that a generic Fund name is an ETF or a CEF", () => {
    const result = classifyFundStructure({
      company: company({ ticker: "PDI", name: "PIMCO Dynamic Income Fund" }),
      quoteType: null,
      category: "Multisector Bond",
    });

    expect(result.structure).toBe("other_fund");
    expect(result.confidence).toBeLessThan(0.8);
  });

  it("fails ambiguous when provider metadata explicitly conflicts between ETF and closed-end evidence", () => {
    const result = classifyFundStructure({
      company: company({ name: "Example Closed-End Fund" }),
      quoteType: "ETF",
      category: "Closed-End Fund",
    });

    expect(result.structure).toBe("other_fund");
    expect(result.reason).toMatch(/conflict|ambiguous/i);
  });
});
