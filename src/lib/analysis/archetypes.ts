import type {
  AnalysisArchetype,
  ArchetypeClassificationDiagnostics,
  FinancialAnalysisInput,
  Sector,
} from "./types";

const BANK_SICS = ["602", "603", "606", "608", "609", "611", "614", "615", "616", "617"];
const INSURANCE_UNDERWRITER_SICS = ["631", "632", "633", "635", "636", "639"];
const INSURANCE_INTERMEDIARY_SICS = ["641"];
const REIT_SICS = ["6798"];
const UTILITY_SICS = ["491", "492", "493", "494"];
const ENERGY_SICS = ["100", "104", "122", "131", "138", "291"];
const BIOTECH_SICS = ["2834", "2835", "2836"];
const SOFTWARE_SICS = ["7370", "7371", "7372", "7373", "7374"];
const AUTOMOTIVE_SICS = ["371"];

function startsWithAny(sic: string, prefixes: string[]): boolean {
  return prefixes.some((prefix) => sic.startsWith(prefix));
}

export function classifyCompany(input: {
  sic?: string | null;
  sicDescription?: string | null;
  name?: string | null;
}): {
  sector: Sector;
  industry: string | null;
  analysisArchetype: AnalysisArchetype;
  classificationDiagnostics: ArchetypeClassificationDiagnostics;
} {
  const sic = (input.sic ?? "").replace(/\D/g, "");
  const description = (input.sicDescription ?? "").trim();
  const text = `${description} ${input.name ?? ""}`.toLowerCase();

  const classified = (
    sector: Sector,
    analysisArchetype: AnalysisArchetype,
    reason: string,
    source: ArchetypeClassificationDiagnostics["source"],
    confidence: number,
    candidates: AnalysisArchetype[] = [analysisArchetype],
  ) => ({
    sector,
    industry: description || null,
    analysisArchetype,
    classificationDiagnostics: {
      reason,
      source,
      confidence,
      ambiguous: new Set(candidates).size > 1,
      candidates: [...new Set(candidates)],
    },
  });

  if (startsWithAny(sic, BANK_SICS) || /\b(banks?|banking|savings institutions?)\b/.test(text)) {
    const source = startsWithAny(sic, BANK_SICS) ? "sic" : "description";
    return classified("financials", "bank", `${source === "sic" ? "SIC" : "Industry description"} identifies a deposit-taking banking business.`, source, source === "sic" ? 0.98 : 0.88);
  }
  const insuranceIntermediary = startsWithAny(sic, INSURANCE_INTERMEDIARY_SICS)
    || /insurance (?:agents?|brokers?|agencies|brokerage|services?)/.test(text)
    || /(?:agents?|brokers?|agencies|brokerage) .*insurance/.test(text);
  if (insuranceIntermediary) {
    const source = startsWithAny(sic, INSURANCE_INTERMEDIARY_SICS) ? "sic" : "description";
    return classified("financials", "standard", `${source === "sic" ? "SIC" : "Industry description"} identifies an insurance intermediary rather than an underwriting carrier.`, source, source === "sic" ? 0.97 : 0.88);
  }
  const insuranceUnderwriter = startsWithAny(sic, INSURANCE_UNDERWRITER_SICS)
    || /\binsurance\b/.test(text)
    || /reinsurance|reinsurer/.test(text);
  if (insuranceUnderwriter) {
    const source = startsWithAny(sic, INSURANCE_UNDERWRITER_SICS) ? "sic" : "description";
    return classified("financials", "insurer", `${source === "sic" ? "SIC" : "Industry description"} identifies an insurance underwriting or reinsurance business.`, source, source === "sic" ? 0.98 : 0.88);
  }
  if (startsWithAny(sic, REIT_SICS) || /\breit\b|real estate investment trust/.test(text)) {
    const source = startsWithAny(sic, REIT_SICS) ? "sic" : "description";
    return classified("realEstate", "reit", `${source === "sic" ? "SIC" : "Industry description"} identifies a real estate investment trust.`, source, source === "sic" ? 0.99 : 0.9);
  }
  if (/\breal estate\b|property development|property management/.test(text)) {
    return classified(
      "realEstate",
      "unknown",
      "Industry description identifies a non-REIT real-estate business; a specialized property-company model is required before corporate methodology can be used.",
      "description",
      0.78,
    );
  }
  if (
    startsWithAny(sic, UTILITY_SICS)
    || /electric services|natural gas distribution|water supply|utilities?[—-]|regulated electric|renewable utilit/.test(text)
  ) {
    const source = startsWithAny(sic, UTILITY_SICS) ? "sic" : "description";
    return classified("utilities", "utility", `${source === "sic" ? "SIC" : "Industry description"} identifies a regulated or utility operating activity.`, source, source === "sic" ? 0.96 : 0.85);
  }
  if (
    startsWithAny(sic, ENERGY_SICS)
    || /petroleum|oil\s*(?:&|and)\s*gas|coal mining|refining\s*(?:&|and)\s*marketing/.test(text)
  ) {
    const source = startsWithAny(sic, ENERGY_SICS) ? "sic" : "description";
    return classified("energy", "cyclical", `${source === "sic" ? "SIC" : "Industry description"} identifies a commodity-sensitive energy business.`, source, source === "sic" ? 0.95 : 0.84);
  }
  if (/basic materials|metals?|minerals?|mining|chemicals?/.test(text)) {
    return classified("materials", "cyclical", "Industry description identifies a commodity-sensitive materials business.", "description", 0.84);
  }
  if (sic.startsWith("3711") || /auto manufacturers?|automobile manufacturers?|passenger car/.test(text)) {
    const source = sic.startsWith("3711") ? "sic" : "description";
    return classified("consumer", "cyclical", `${source === "sic" ? "SIC" : "Industry description"} identifies a cycle-sensitive passenger-vehicle manufacturer.`, source, source === "sic" ? 0.94 : 0.84);
  }
  if (
    startsWithAny(sic, AUTOMOTIVE_SICS)
    || /motor vehicles?|automotive|truck manufacturing|heavy construction machinery/.test(text)
  ) {
    const source = startsWithAny(sic, AUTOMOTIVE_SICS) ? "sic" : "description";
    return classified("industrials", "cyclical", `${source === "sic" ? "SIC" : "Industry description"} identifies a cycle-sensitive transport-equipment or heavy-machinery manufacturer.`, source, source === "sic" ? 0.94 : 0.84);
  }
  if (startsWithAny(sic, BIOTECH_SICS) || /biological products|biotechnology/.test(text)) {
    const source = startsWithAny(sic, BIOTECH_SICS) ? "sic" : "description";
    const archetype = /development stage|pre-revenue/.test(text) ? "pre_revenue_biotech" : "standard";
    return classified("healthcare", archetype, `${source === "sic" ? "SIC" : "Industry description"} identifies a biotechnology business${archetype === "pre_revenue_biotech" ? " in development stage" : ""}.`, source, archetype === "pre_revenue_biotech" ? 0.92 : 0.82);
  }
  if (startsWithAny(sic, SOFTWARE_SICS) || /software|cloud computing/.test(text)) {
    const source = startsWithAny(sic, SOFTWARE_SICS) ? "sic" : "description";
    return classified("technology", "software_growth", `${source === "sic" ? "SIC" : "Industry description"} identifies a software business.`, source, source === "sic" ? 0.93 : 0.82);
  }
  if (/holding compan/.test(text)) {
    return classified("financials", "holding_company", "Industry description identifies an investment holding company.", "description", 0.82);
  }
  if (/electronic gaming|gaming\s*(?:&|and)\s*multimedia|interactive media|video games?/.test(text)) {
    return classified("communication", "standard", "Industry description identifies an interactive gaming or multimedia business.", "description", 0.82);
  }
  if (/semiconductor|computer|electronic|communication equipment|information technology services|\bit services\b|scientific\s*(?:&|and)\s*technical instruments|scientific instruments/.test(text)) {
    return classified("technology", "standard", "Industry description identifies an operating technology, IT-services, instrumentation or communications-equipment company.", "description", 0.8);
  }
  if (/internet retail|discount stores?|specialty retail|department stores?|consumer cyclical|consumer defensive/.test(text)) {
    return classified("consumer", "standard", "Industry description identifies a consumer retail or consumer-products business.", "description", 0.82);
  }
  if (/telecom|telecommunications?|communication services|wireless services/.test(text)) {
    return classified("communication", "standard", "Industry description identifies a communications-services business.", "description", 0.82);
  }
  if (/drug manufacturers?|pharmaceutical|medical devices?|diagnostics|healthcare/.test(text)) {
    return classified("healthcare", "standard", "Industry description identifies a healthcare operating business.", "description", 0.82);
  }
  if (/airlines?|marine shipping|ocean shipping|railroads?/.test(text)) {
    return classified("industrials", "cyclical", "Industry description identifies a capital-intensive, cycle-sensitive transportation business.", "description", 0.84);
  }
  if (/logistics|freight|transportation/.test(text)) {
    return classified("industrials", "standard", "Industry description identifies a transportation-services or logistics operating business.", "description", 0.8);
  }
  if (/financial data|stock exchanges?|securities exchanges?|market infrastructure/.test(text)) {
    return classified("financials", "standard", "Industry description identifies financial-market infrastructure or data services rather than a balance-sheet financial institution.", "description", 0.8);
  }
  if (/capital markets/.test(text)) {
    return classified("financials", "unknown", "Industry description identifies a capital-markets business; a specialized capital-markets model is required before corporate methodology can be used.", "description", 0.8);
  }
  if (/asset management|investment management|investment advisers?/.test(text)) {
    return classified("financials", "unknown", "Industry description identifies an asset-management business; a specialized asset-manager model is required before corporate methodology can be used.", "description", 0.8);
  }
  if (/financial services|finance compan|broker/.test(text)) {
    return classified("financials", "unknown", "Financial-services wording is not specific enough to select a bank, insurer, asset-manager, or holding-company model.", "description", 0.35);
  }
  if (/security\s*(?:&|and)\s*protection services|specialty business services|manufactur|industrial machinery|aerospace|defense|construction|electrical equipment|conglomerates?/.test(text)) {
    return classified("industrials", "standard", "Industry description identifies a conventional industrial or business-services operating company.", "description", 0.76);
  }

  return classified("other", "unknown", "Available SIC and industry evidence is insufficient for a reliable archetype.", "fallback", 0.2);
}

export function resolveArchetype(input: {
  analysisArchetype?: AnalysisArchetype;
  sector?: Sector;
  industry?: string;
}): AnalysisArchetype {
  if (input.analysisArchetype) return input.analysisArchetype;
  if (input.sector === "financials") return "unknown";
  if (input.sector === "realEstate") {
    return /\breit\b|real estate investment trusts?/i.test(input.industry ?? "") ? "reit" : "unknown";
  }
  if (input.sector === "utilities") return "utility";
  if (input.sector === "energy" || input.sector === "materials") return "cyclical";
  if (input.sector === "technology" && /software|cloud|saas/i.test(input.industry ?? "")) {
    return "software_growth";
  }
  return input.sector ? "standard" : "unknown";
}

export function resolveFinancialArchetype(input: FinancialAnalysisInput): AnalysisArchetype {
  const base = resolveArchetype(input.company);
  if (base === "pre_revenue_biotech") return base;
  if (base !== "standard") return base;

  const sic = (input.company.sic ?? "").replace(/\D/g, "");
  const industry = (input.company.industry ?? "").toLowerCase();
  const biotechEvidence = input.company.sector === "healthcare"
    && (startsWithAny(sic, BIOTECH_SICS) || /biotechnology|biological products/.test(industry));
  if (!biotechEvidence) return base;

  const periods = [...input.annualPeriods]
    .filter((period) => period.fiscalYear !== undefined || period.periodEndDate)
    .sort((left, right) => (left.periodEndDate ?? String(left.fiscalYear ?? "")).localeCompare(right.periodEndDate ?? String(right.fiscalYear ?? "")))
    .slice(-3);
  if (periods.length < 2) return base;

  const immaterialRevenue = periods.every((period) => {
    if (typeof period.revenue !== "number" || !Number.isFinite(period.revenue)) return false;
    if (Math.abs(period.revenue) <= 1e-9) return true;
    return typeof period.researchAndDevelopment === "number"
      && Number.isFinite(period.researchAndDevelopment)
      && period.researchAndDevelopment > 0
      && Math.abs(period.revenue) <= Math.abs(period.researchAndDevelopment) * 0.1;
  });
  const persistentLosses = periods.every((period) =>
    (typeof period.operatingIncome === "number" && period.operatingIncome < 0)
    || (typeof period.netIncome === "number" && period.netIncome < 0)
  );
  const negativeOperatingCashFlow = periods.every((period) =>
    typeof period.operatingCashFlow === "number" && Number.isFinite(period.operatingCashFlow) && period.operatingCashFlow < 0
  );
  const meaningfulResearch = periods.every((period) =>
    typeof period.researchAndDevelopment === "number" && Number.isFinite(period.researchAndDevelopment) && period.researchAndDevelopment > 0
  );

  return immaterialRevenue && persistentLosses && negativeOperatingCashFlow && meaningfulResearch
    ? "pre_revenue_biotech"
    : base;
}

export function supportsFcffDcf(archetype: AnalysisArchetype): boolean {
  return !["bank", "insurer", "reit", "pre_revenue_biotech", "holding_company", "unknown"].includes(
    archetype,
  );
}
