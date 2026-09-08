import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { analyzeInvestmentCompany } from "../../src/lib/analysis/universal-security";

describe("Investment-company leverage authority V3", () => {
  it("does not activate holding-company leverage from generic consolidated debt", () => {
    const result = analyzeInvestmentCompany({
      sharePrice: 90,
      dilutedShares: 100,
      reportedNav: 10_000,
      debt: 5_000,
    });

    expect(result.score.factors.find((factor) => factor.key === "leverage")).toMatchObject({
      status: "missing",
      score: null,
      value: null,
    });
  });

  it("uses an explicit verified holding-company leverage ratio when supplied", () => {
    const result = analyzeInvestmentCompany({
      sharePrice: 90,
      dilutedShares: 100,
      reportedNav: 10_000,
      debt: 9_000,
      holdingCompanyLeverageRatio: 0.12,
    });

    const leverage = result.score.factors.find((factor) => factor.key === "leverage");
    expect(leverage?.status).toBe("available");
    expect(leverage?.value).toBeCloseTo(0.12, 8);
    expect(leverage?.score).not.toBeNull();
  });

  it.each([-0.01, 1, 1.2, Number.NaN])("fails closed for invalid explicit leverage ratio %s", (ratio) => {
    const result = analyzeInvestmentCompany({
      sharePrice: 90,
      dilutedShares: 100,
      reportedNav: 10_000,
      holdingCompanyLeverageRatio: ratio,
    });

    expect(result.score.factors.find((factor) => factor.key === "leverage")).toMatchObject({
      status: "missing",
      score: null,
      value: null,
    });
  });

  it("keeps the provider boundary from passing generic totalDebt into the investment-company specialist", () => {
    const provider = readFileSync("src/lib/data/universal-security-provider.ts", "utf8");
    const specialistCall = provider.slice(
      provider.indexOf("const analysis = analyzeInvestmentCompany({"),
      provider.indexOf("});", provider.indexOf("const analysis = analyzeInvestmentCompany({")) + 3,
    );

    expect(specialistCall).not.toContain("debt: latest?.totalDebt");
    expect(specialistCall).toContain("holdingCompanyLeverageRatio");
  });
});
