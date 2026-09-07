import { describe, expect, it } from "vitest";

import { analyzeInvestmentCompany } from "../../src/lib/analysis/universal-security";

describe("investment-company explicit leverage ratio", () => {
  it("uses a verified holding-company leverage ratio without manufacturing debt", () => {
    const input = {
      sharePrice: 90,
      dilutedShares: 100,
      reportedNavPerShare: 100,
      holdingCompanyLeverageRatio: 0.09,
    };

    const result = analyzeInvestmentCompany(input);
    const leverage = result.score.factors.find((factor) => factor.key === "leverage");

    expect(leverage?.status).toBe("available");
    expect(leverage?.value).toBeCloseTo(0.09, 12);
  });

  it("prefers explicit verified leverage ratio over a debt-derived fallback", () => {
    const input = {
      sharePrice: 90,
      dilutedShares: 100,
      reportedNavPerShare: 100,
      debt: 2_500,
      holdingCompanyLeverageRatio: 0.09,
    };

    const result = analyzeInvestmentCompany(input);
    const leverage = result.score.factors.find((factor) => factor.key === "leverage");

    expect(leverage?.status).toBe("available");
    expect(leverage?.value).toBeCloseTo(0.09, 12);
    expect(leverage?.value).not.toBeCloseTo(0.2, 12);
  });

  it.each([1, 1.5, 9, 100, -0.01, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects an out-of-domain explicit leverage ratio %s instead of creating specialist coverage",
    (holdingCompanyLeverageRatio) => {
      const result = analyzeInvestmentCompany({
        sharePrice: 90,
        dilutedShares: 100,
        reportedNavPerShare: 100,
        holdingCompanyLeverageRatio,
      });
      const leverage = result.score.factors.find((factor) => factor.key === "leverage");

      expect(leverage?.status).toBe("missing");
      expect(leverage?.value).toBeNull();
    },
  );

  it("falls back to verified debt-derived leverage when the explicit ratio is invalid", () => {
    const result = analyzeInvestmentCompany({
      sharePrice: 90,
      dilutedShares: 100,
      reportedNavPerShare: 100,
      debt: 2_500,
      holdingCompanyLeverageRatio: 1.5,
    });
    const leverage = result.score.factors.find((factor) => factor.key === "leverage");

    expect(leverage?.status).toBe("available");
    expect(leverage?.value).toBeCloseTo(0.2, 12);
  });
});
