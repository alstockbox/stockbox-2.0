import { describe, expect, it } from "vitest";
import { classifyCompany } from "../../src/lib/analysis/archetypes";

describe("investment-vehicle archetype boundaries", () => {
  it("keeps genuine investment holding companies on the NAV/SOTP holding-company model", () => {
    const result = classifyCompany({
      sicDescription: "Investment Holding Company",
      name: "Long-Term Investment Holdings AB",
    });

    expect(result).toEqual(expect.objectContaining({
      sector: "financials",
      analysisArchetype: "holding_company",
    }));
  });

  it("keeps fee-based asset managers on the asset-manager model", () => {
    const result = classifyCompany({
      sicDescription: "Asset Management Financial Services",
      name: "Global Asset Manager Inc",
    });

    expect(result).toEqual(expect.objectContaining({
      sector: "financials",
      analysisArchetype: "asset_manager",
    }));
  });

  it.each([
    ["Business Development Company Financial Services", "Listed BDC Inc"],
    ["BDC Specialty Finance", "Listed Credit Vehicle Inc"],
    ["Specialty Lending Financial Services", "Direct Lending Corp"],
  ] as const)("fails closed instead of applying holding-company economics to %s", (sicDescription, name) => {
    const result = classifyCompany({ sicDescription, name });

    expect(result).toEqual(expect.objectContaining({
      sector: "financials",
      analysisArchetype: "unknown",
    }));
    expect(result.classificationDiagnostics.ambiguous).toBe(false);
    expect(result.classificationDiagnostics.reason).toMatch(/specialized|dedicated|bdc|lending/i);
  });

  it("keeps REIT economics separate from investment holding companies", () => {
    const result = classifyCompany({
      sic: "6798",
      sicDescription: "Real Estate Investment Trusts",
      name: "Property REIT",
    });

    expect(result).toEqual(expect.objectContaining({
      sector: "realEstate",
      analysisArchetype: "reit",
    }));
  });
});
