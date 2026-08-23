import { describe, expect, it } from "vitest";
import { classifyCompany } from "../../src/lib/analysis";

describe("deterministic SIC classification", () => {
  it.each([
    ["6021", "National Commercial Banks", "bank", "financials"],
    ["6331", "Fire Marine and Casualty Insurance", "insurer", "financials"],
    ["6798", "Real Estate Investment Trusts", "reit", "realEstate"],
    ["4911", "Electric Services", "utility", "utilities"],
    ["1311", "Crude Petroleum and Natural Gas", "cyclical", "energy"],
    ["7372", "Prepackaged Software", "software_growth", "technology"],
  ])("maps SIC %s to %s", (sic, description, archetype, sector) => {
    expect(classifyCompany({ sic, sicDescription: description })).toMatchObject({ analysisArchetype: archetype, sector });
  });

  it("keeps unknown classification honest", () => {
    expect(classifyCompany({ sic: "9999", sicDescription: "Unclassified" })).toMatchObject({ analysisArchetype: "unknown", sector: "other" });
  });

  it("classifies NNN's SEC SIC as a REIT", () => {
    expect(classifyCompany({ sic: "6798", name: "NNN REIT, INC." })).toMatchObject({
      analysisArchetype: "reit",
      sector: "realEstate",
    });
  });
});
