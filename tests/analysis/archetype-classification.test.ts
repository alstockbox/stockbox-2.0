import { describe, expect, it } from "vitest";
import { classifyCompany, resolveArchetype, resolveFinancialArchetype } from "../../src/lib/analysis/archetypes";
import type { FinancialAnalysisInput, FinancialPeriod } from "../../src/lib/analysis/types";

describe("company archetype classification", () => {
  it("classifies passenger-vehicle manufacturers as consumer cyclicals rather than industrials", () => {
    expect(classifyCompany({
      sic: "3711",
      sicDescription: "Motor Vehicles & Passenger Car Bodies",
      name: "Global Auto Manufacturer",
    })).toEqual(expect.objectContaining({
      sector: "consumer",
      analysisArchetype: "cyclical",
    }));
  });

  it("classifies global auto manufacturers as consumer cyclicals", () => {
    expect(classifyCompany({ sicDescription: "Auto Manufacturers Consumer Cyclical", name: "Global Auto Manufacturer" })).toEqual(expect.objectContaining({
      sector: "consumer",
      analysisArchetype: "cyclical",
    }));
  });

  it("keeps heavy construction machinery in industrial cyclicals", () => {
    expect(classifyCompany({ sicDescription: "Farm & Heavy Construction Machinery", name: "Global Heavy Equipment Manufacturer" })).toEqual(expect.objectContaining({
      sector: "industrials",
      analysisArchetype: "cyclical",
    }));
  });
});

describe("global operating-sector classification", () => {
  it.each([
    ["Internet Retail Consumer Cyclical", "consumer", "standard"],
    ["Discount Stores Consumer Defensive", "consumer", "standard"],
    ["Telecom Services Communication Services", "communication", "standard"],
    ["Communication Equipment", "technology", "standard"],
    ["Electronic Gaming & Multimedia Communication Services", "communication", "standard"],
    ["Drug Manufacturers - General Healthcare", "healthcare", "standard"],
    ["Airlines Industrials", "industrials", "cyclical"],
    ["Marine Shipping Industrials", "industrials", "cyclical"],
    ["Railroads Industrials", "industrials", "cyclical"],
    ["Integrated Freight & Logistics Industrials", "industrials", "standard"],
    ["Electrical Equipment & Parts", "industrials", "standard"],
    ["Conglomerates", "industrials", "standard"],
    ["Oil & Gas Integrated", "energy", "cyclical"],
    ["Oil & Gas E&P", "energy", "cyclical"],
    ["Oil & Gas Refining & Marketing", "energy", "cyclical"],
    ["Utilities—Renewable", "utilities", "utility"],
    ["Utilities—Regulated Electric", "utilities", "utility"],
    ["Utilities—Diversified", "utilities", "utility"],
    ["Security & Protection Services Industrials", "industrials", "standard"],
    ["Financial Data & Stock Exchanges Financial Services", "financials", "standard"],
    ["Information Technology Services Technology", "technology", "standard"],
    ["Scientific & Technical Instruments Technology", "technology", "standard"],
    ["Specialty Business Services Industrials", "industrials", "standard"],
    ["Tools & Accessories Industrials", "industrials", "standard"],
  ] as const)("routes %s without generic services/retail leakage", (sicDescription, sector, archetype) => {
    expect(classifyCompany({ sicDescription, name: "Global Operating Company" })).toEqual(expect.objectContaining({
      sector,
      analysisArchetype: archetype,
    }));
  });
});

describe("specialized financial-services classification", () => {
  it("recognizes asset management as a confidently unsupported specialist model", () => {
    const result = classifyCompany({ sicDescription: "Asset Management Financial Services", name: "Global Asset Manager" });
    expect(result).toEqual(expect.objectContaining({ sector: "financials", analysisArchetype: "investment_entity" }));
    expect(result.classificationDiagnostics).toEqual(expect.objectContaining({
      ambiguous: false,
      confidence: expect.any(Number),
    }));
    expect(result.classificationDiagnostics.confidence).toBeGreaterThanOrEqual(0.75);
  });

  it("routes an investment-company name to the holding-company model even when Yahoo calls the industry Asset Management", () => {
    const result = classifyCompany({ sicDescription: "Asset Management Financial Services", name: "Investor AB" });
    expect(result).toEqual(expect.objectContaining({ sector: "financials", analysisArchetype: "holding_company" }));
  });

  it("recognizes capital-markets groups as confidently unsupported specialist financials", () => {
    const result = classifyCompany({ sicDescription: "Capital Markets Financial Services", name: "Global Capital Markets Group" });
    expect(result).toEqual(expect.objectContaining({ sector: "financials", analysisArchetype: "financial_intermediary" }));
    expect(result.classificationDiagnostics).toEqual(expect.objectContaining({ ambiguous: false }));
    expect(result.classificationDiagnostics.confidence).toBeGreaterThanOrEqual(0.75);
  });

  it.each(["Credit Services Financial Services", "Mortgage Finance Financial Services"])("routes specialist lending/intermediation industries to a financial-intermediary model: %s", (sicDescription) => {
    expect(classifyCompany({ sicDescription, name: "Financial Group" })).toEqual(expect.objectContaining({ sector: "financials", analysisArchetype: "financial_intermediary" }));
  });

});

describe("bank industry wording", () => {
  it.each([
    "Banks—Diversified Financial Services",
    "Banks—Regional Financial Services",
  ])("classifies plural bank industries as banks: %s", (sicDescription) => {
    expect(classifyCompany({ sicDescription, name: "Financial Group" })).toEqual(expect.objectContaining({
      sector: "financials",
      analysisArchetype: "bank",
    }));
  });
});

describe("classification diagnostics", () => {
  it.each([
    [{ sic: "6021", sicDescription: "National Commercial Banks", name: "Regional Bank" }, "bank"],
    [{ sic: "6331", sicDescription: "Fire, Marine and Casualty Insurance", name: "Insurance Group" }, "insurer"],
    [{ sic: "6798", sicDescription: "Real Estate Investment Trusts", name: "Property Trust" }, "reit"],
    [{ sic: "4911", sicDescription: "Electric Services", name: "Grid Power" }, "utility"],
    [{ sic: "1311", sicDescription: "Crude Petroleum and Natural Gas", name: "Energy Producer" }, "cyclical"],
    [{ sicDescription: "Basic Materials Mining", name: "Materials Producer" }, "cyclical"],
    [{ sic: "3711", sicDescription: "Motor Vehicles", name: "Auto Manufacturer" }, "cyclical"],
    [{ sic: "7372", sicDescription: "Prepackaged Software", name: "Cloud Software" }, "software_growth"],
    [{ sicDescription: "Semiconductors", name: "Chip Designer" }, "standard"],
    [{ sic: "2836", sicDescription: "Biological Products Development Stage", name: "Pre-Revenue Biotech" }, "pre_revenue_biotech"],
    [{ sicDescription: "Investment Holding Company", name: "Long-Term Holdings" }, "holding_company"],
    [{ sicDescription: "Industrial Machinery Manufacturing", name: "Factory Systems" }, "standard"],
    [{ sicDescription: "Diversified Financial Services", name: "Financial Group" }, "unknown"],
  ] as const)("classifies %o with auditable diagnostics", (input, expected) => {
    const result = classifyCompany(input);

    expect(result.analysisArchetype).toBe(expected);
    expect(result.classificationDiagnostics).toEqual(expect.objectContaining({
      reason: expect.any(String),
      source: expect.stringMatching(/sic|description|fallback/),
      confidence: expect.any(Number),
      ambiguous: expect.any(Boolean),
    }));
    expect(result.classificationDiagnostics.confidence).toBeGreaterThanOrEqual(0);
    expect(result.classificationDiagnostics.confidence).toBeLessThanOrEqual(1);
  });
});

describe("non-REIT real estate classification", () => {
  it.each([
    "Real Estate Services Real Estate",
    "Residential Real Estate Development",
    "Property Management Real Estate",
  ])("keeps broad real-estate operating businesses out of the generic corporate archetype: %s", (sicDescription) => {
    expect(classifyCompany({ sicDescription, name: "Property Group" })).toEqual(expect.objectContaining({
      sector: "realEstate",
      analysisArchetype: "property_company",
    }));
  });
});

describe("real estate archetype resolution", () => {
  it("does not treat a broad real-estate sector as REIT evidence", () => {
    expect(resolveArchetype({ sector: "realEstate", industry: "Real Estate Development" })).toBe("property_company");
    expect(resolveArchetype({ sector: "realEstate", industry: "Real Estate Services" })).toBe("property_company");
    expect(resolveArchetype({ sector: "realEstate", industry: "Property Management" })).toBe("property_company");
  });

  it("resolves a real-estate company as REIT only when REIT evidence is present", () => {
    expect(resolveArchetype({ sector: "realEstate", industry: "Real Estate Investment Trusts" })).toBe("reit");
    expect(resolveArchetype({ sector: "realEstate", industry: "Retail REIT" })).toBe("reit");
  });
});

describe("financial biotech refinement", () => {
  const biotech = (periods: FinancialPeriod[]): FinancialAnalysisInput => ({
    company: { sector: "healthcare", industry: "Biotechnology", sic: "2836", analysisArchetype: "standard" },
    annualPeriods: periods,
    analysisDate: "2026-08-26T12:00:00.000Z",
  });

  it("detects pre-revenue biotech from multiple financial signals", () => {
    expect(resolveFinancialArchetype(biotech([
      { fiscalYear: 2024, revenue: 0, operatingIncome: -90, netIncome: -100, operatingCashFlow: -75, researchAndDevelopment: 80 },
      { fiscalYear: 2025, revenue: 0, operatingIncome: -110, netIncome: -120, operatingCashFlow: -95, researchAndDevelopment: 100 },
    ]))).toBe("pre_revenue_biotech");
  });

  it("keeps a commercial biotech on standard methodology", () => {
    expect(resolveFinancialArchetype(biotech([
      { fiscalYear: 2024, revenue: 500, operatingIncome: -20, netIncome: -30, operatingCashFlow: -10, researchAndDevelopment: 120 },
      { fiscalYear: 2025, revenue: 700, operatingIncome: 40, netIncome: 25, operatingCashFlow: 60, researchAndDevelopment: 150 },
    ]))).toBe("standard");
  });

  it("does not infer pre-revenue status from one sparse year", () => {
    expect(resolveFinancialArchetype(biotech([
      { fiscalYear: 2025, revenue: 0, netIncome: -100, operatingCashFlow: -80, researchAndDevelopment: 90 },
    ]))).toBe("standard");
  });
});

describe("insurance underwriting classification", () => {
  it.each([
    { sic: "6411", sicDescription: "Insurance Agents, Brokers and Service", name: "Independent Insurance Broker" },
    { sicDescription: "Insurance Brokers and Agencies", name: "Brokerage Group" },
  ])("does not treat insurance intermediaries as underwriting insurers: $sicDescription", (input) => {
    expect(classifyCompany(input).analysisArchetype).not.toBe("insurer");
  });

  it.each([
    { sic: "6331", sicDescription: "Fire, Marine and Casualty Insurance", name: "Property Casualty Carrier" },
    { sic: "6311", sicDescription: "Life Insurance", name: "Life Carrier" },
    { sicDescription: "Reinsurance Carrier", name: "Global Reinsurance Group" },
  ])("keeps genuine insurance risk carriers on insurer methodology: $sicDescription", (input) => {
    expect(classifyCompany(input).analysisArchetype).toBe("insurer");
  });
});
