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
  it("recognizes asset management as a supported asset-manager specialist model", () => {
    const result = classifyCompany({ sicDescription: "Asset Management Financial Services", name: "Global Asset Manager" });
    expect(result).toEqual(expect.objectContaining({ sector: "financials", analysisArchetype: "asset_manager" }));
    expect(result.classificationDiagnostics).toEqual(expect.objectContaining({
      ambiguous: false,
      confidence: expect.any(Number),
    }));
    expect(result.classificationDiagnostics.confidence).toBeGreaterThanOrEqual(0.75);
  });

  it("recognizes capital-markets groups as confidently unsupported specialist financials", () => {
    const result = classifyCompany({ sicDescription: "Capital Markets Financial Services", name: "Global Capital Markets Group" });
    expect(result).toEqual(expect.objectContaining({ sector: "financials", analysisArchetype: "unknown" }));
    expect(result.classificationDiagnostics).toEqual(expect.objectContaining({ ambiguous: false }));
    expect(result.classificationDiagnostics.confidence).toBeGreaterThanOrEqual(0.75);
  });

  it.each([
    "Credit Services Financial Services",
    "Shell Companies Financial Services",
    "Financial Conglomerates Financial Services",
  ])("recognizes %s as a confidently unsupported specialist financial model", (sicDescription) => {
    const result = classifyCompany({ sicDescription, name: "Specialized Financial Company" });

    expect(result).toEqual(expect.objectContaining({ sector: "financials", analysisArchetype: "unknown" }));
    expect(result.classificationDiagnostics).toEqual(expect.objectContaining({ ambiguous: false }));
    expect(result.classificationDiagnostics.confidence).toBeGreaterThanOrEqual(0.75);
    expect(result.classificationDiagnostics.reason).toMatch(/specialized/i);
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
  ])("classifies broad real-estate operating businesses as property companies: %s", (sicDescription) => {
    expect(classifyCompany({ sicDescription, name: "Property Group" })).toEqual(expect.objectContaining({
      sector: "realEstate",
      analysisArchetype: "property_company",
    }));
  });
});

describe("real estate archetype resolution", () => {
  it("resolves broad real-estate operators as property companies instead of REITs", () => {
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

describe("company-name archetype recovery", () => {
  it.each([
    ["Nordic Fastigheter AB", "realEstate", "property_company"],
    ["Nordic Pharma AB", "healthcare", "standard"],
    ["Nordic Medtech AB", "healthcare", "standard"],
    ["Genetic Analysis AS", "healthcare", "standard"],
    ["Nordic Games AB", "communication", "standard"],
    ["Nordic Silver AB", "materials", "cyclical"],
    ["Nordic Minerals AB", "materials", "cyclical"],
    ["Africa Resources AB", "materials", "cyclical"],
    ["BW Energy Limited", "energy", "cyclical"],
    ["Crown Energy AB", "energy", "cyclical"],
    ["Interoil Exploration and Production ASA", "energy", "cyclical"],
    ["Level Bio AB", "healthcare", "standard"],
    ["Argo Defence Group AB", "industrials", "standard"],
    ["Lohilo Foods AB", "consumer", "standard"],
    ["Polymer Factory Sweden AB", "materials", "cyclical"],
    ["JonDeTech Sensors AB", "technology", "standard"],
    ["Nord Insuretech Group AB", "financials", "standard"],
  ] as const)("recovers %s from a clear issuer-name business signal", (name, sector, archetype) => {
    expect(classifyCompany({ name })).toEqual(expect.objectContaining({
      sector,
      analysisArchetype: archetype,
    }));
  });

  it("does not let materials name recovery override a clearer gaming business signal", () => {
    expect(classifyCompany({ name: "Gold Town Games AB" })).toEqual(expect.objectContaining({
      sector: "communication",
      analysisArchetype: "standard",
    }));
  });

  it.each([
    { sicDescription: "Engineering & Construction Industrials", name: "Bravida Holding AB (publ)", sector: "industrials", archetype: "standard" },
    { sicDescription: "Medical Devices Healthcare", name: "Bonesupport Holding AB (publ)", sector: "healthcare", archetype: "standard" },
    { sicDescription: "Specialty Business Services Industrials", name: "Coor Service Management Holding AB", sector: "industrials", archetype: "standard" },
    { sicDescription: "Industrial Machinery Manufacturing", name: "Nederman Holding AB (publ)", sector: "industrials", archetype: "standard" },
  ] as const)("does not treat a legal holding suffix as NAV evidence for operating companies: $name", ({ sicDescription, name, sector, archetype }) => {
    expect(classifyCompany({ sicDescription, name })).toEqual(expect.objectContaining({
      sector,
      analysisArchetype: archetype,
    }));
  });

  it("does not infer a holding-company model from a bare legal holding suffix without investment evidence", () => {
    expect(classifyCompany({ name: "Bravida Holding AB (publ)" }).analysisArchetype).not.toBe("holding_company");
  });
});

describe("investment holding-company refinement", () => {
  const investmentFinancials = (operating = false): FinancialAnalysisInput => ({
    company: { sector: "financials", industry: "Asset Management", analysisArchetype: "unknown", name: operating ? "Global Asset Manager" : "Diversified Investment Group" },
    annualPeriods: [2024, 2025].map((fiscalYear, index) => ({
      fiscalYear,
      periodEndDate: `${fiscalYear}-12-31`,
      revenue: 200 + index * 20,
      netIncome: operating ? 35 + index * 5 : 150 + index * 15,
      grossProfit: operating ? 140 + index * 10 : null,
      operatingIncome: operating ? 60 + index * 5 : null,
      operatingCashFlow: operating ? 70 + index * 5 : null,
      totalAssets: 1_000 + index * 100,
      totalEquity: operating ? 400 + index * 20 : 850 + index * 80,
    })),
  });

  it("infers a holding-company model from repeated investment-company financial structure", () => {
    expect(resolveFinancialArchetype(investmentFinancials(false))).toBe("holding_company");
  });

  it("does not misclassify an operating asset manager as a holding company", () => {
    expect(resolveFinancialArchetype(investmentFinancials(true))).toBe("asset_manager");
  });

  it("lets holding-company financial structure override a broad asset-management label", () => {
    const input = investmentFinancials(false);

    expect(resolveFinancialArchetype({
      ...input,
      company: {
        ...input.company,
        analysisArchetype: "asset_manager",
      },
    })).toBe("holding_company");
  });

  it("treats equity-heavy investment gains as holding-company evidence even when operating fields are present", () => {
    const input = investmentFinancials(false);

    expect(resolveFinancialArchetype({
      ...input,
      company: {
        ...input.company,
        analysisArchetype: "asset_manager",
      },
      annualPeriods: input.annualPeriods.map((period, index) => ({
        ...period,
        revenue: 120 + index * 10,
        grossProfit: 115 + index * 9,
        operatingIncome: 95 + index * 8,
        netIncome: 190 + index * 20,
        operatingCashFlow: 35 + index * 4,
        totalAssets: 1_000 + index * 120,
        totalEquity: 860 + index * 100,
      })),
    })).toBe("holding_company");
  });

  it("recognizes explicit investment-company wording without treating asset management as equivalent", () => {
    expect(classifyCompany({ sicDescription: "Investment Company Financial Services", name: "Diversified Investments" }).analysisArchetype).toBe("holding_company");
    expect(classifyCompany({ sicDescription: "Asset Management Financial Services", name: "Nordic Investment AB" }).analysisArchetype).toBe("holding_company");
    expect(classifyCompany({ sicDescription: "Asset Management Financial Services", name: "Nordic Holding AB" }).analysisArchetype).toBe("holding_company");
    expect(classifyCompany({ sicDescription: "Asset Management Financial Services", name: "Nordic Ventures AB" }).analysisArchetype).toBe("holding_company");
    expect(classifyCompany({ sicDescription: "Asset Management Financial Services", name: "Nordic Equity AB" }).analysisArchetype).toBe("holding_company");
    expect(classifyCompany({ sicDescription: "Asset Management Financial Services", name: "Nordic Capital AB" }).analysisArchetype).toBe("holding_company");
    expect(classifyCompany({ sicDescription: "Asset Management Financial Services", name: "Nordic Invest Growth AB" }).analysisArchetype).toBe("holding_company");
    expect(classifyCompany({ sicDescription: "Asset Management Financial Services", name: "Global Asset Manager" }).analysisArchetype).toBe("asset_manager");
    expect(classifyCompany({ sicDescription: "Asset Management Financial Services", name: "Global Capital Management AB" }).analysisArchetype).toBe("asset_manager");
  });

  it("keeps corporate-finance and brokerage names on unresolved capital-markets methodology", () => {
    expect(classifyCompany({ sicDescription: "Asset Management Financial Services", name: "Nordic Corporate Finance AB" }).analysisArchetype).toBe("unknown");
    expect(classifyCompany({ sicDescription: "Asset Management Financial Services", name: "Nordic Fondkommission AB" }).analysisArchetype).toBe("unknown");
    expect(classifyCompany({ sicDescription: "Asset Management Financial Services", name: "Nordic Treasury AB" }).analysisArchetype).toBe("unknown");
  });

  it("does not upgrade a confident capital-markets specialist stop to asset manager from financial statement shape alone", () => {
    const input = investmentFinancials(true);

    expect(resolveFinancialArchetype({
      ...input,
      company: {
        ...input.company,
        name: "Nordic Corporate Finance AB",
        analysisArchetype: "unknown",
        classificationDiagnostics: {
          reason: "Industry description identifies a capital-markets business; a specialized capital-markets model is required before corporate methodology can be used.",
          source: "description",
          confidence: 0.8,
          ambiguous: false,
          candidates: ["unknown"],
        },
      },
    })).toBe("unknown");
  });

  it.each([
    { sicDescription: "Business Development Company Financial Services", name: "Goldman Sachs BDC, Inc." },
    { sicDescription: "Credit Services Financial Services", name: "Sixth Street Specialty Lending, Inc." },
    { sic: "6726", sicDescription: "Unit Investment Trusts, Face-Amount Certificate Offices, and Closed-End Management Investment Offices", name: "Specialty Finance BDC" },
  ])("routes BDC and specialty-lending financials to NAV-style holding methodology: $name", (input) => {
    const result = classifyCompany(input);

    expect(result).toEqual(expect.objectContaining({
      sector: "financials",
      analysisArchetype: "holding_company",
    }));
    expect(result.classificationDiagnostics.confidence).toBeGreaterThanOrEqual(0.8);
  });
});
