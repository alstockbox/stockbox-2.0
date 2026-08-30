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
const INVESTMENT_COMPANY_SICS = ["672"];
const UTILITY_SICS = ["491", "492", "493", "494"];
const ENERGY_SICS = ["100", "104", "122", "131", "138", "291"];
const BIOTECH_SICS = ["2834", "2835", "2836"];
const SOFTWARE_SICS = ["7370", "7371", "7372", "7373", "7374"];
const AUTOMOTIVE_SICS = ["371"];
const LEGAL_ENTITY_SUFFIX = String.raw`(?:ab|asa|as|a\/s|plc|ltd|limited|inc|corp|corporation)`;
const HOLDING_VEHICLE_NAME_PATTERN =
  /\b(?:investment|invest|equity|ventures?)(?:\s+\w+){0,2}\s+(?:ab|asa|plc|ltd|limited|inc|corp|corporation)\b|\bcapital\s+(?:ab|asa|plc|ltd|limited|inc|corp|corporation)\b|\b(?:ab|asa|plc|ltd|limited|inc|corp|corporation)\s+(?:investment|invest|equity|ventures?|capital)\b/;
const LEGAL_HOLDING_SUFFIX_PATTERN =
  /\bholdings?(?:\s+\w+){0,2}\s+(?:ab|asa|plc|ltd|limited|inc|corp|corporation)\b|\b(?:ab|asa|plc|ltd|limited|inc|corp|corporation)\s+holdings?\b/;
const ENERGY_NAME_PATTERN = new RegExp(
  String.raw`\b(?:energy|petroleum|oil|gas)\s+${LEGAL_ENTITY_SUFFIX}\b|\b${LEGAL_ENTITY_SUFFIX}\s+(?:energy|petroleum|oil|gas)\b|\bexploration\s*(?:&|and)\s*production\b`,
);
const MATERIALS_NAME_PATTERN = new RegExp(
  String.raw`\b(?:resources?|silver|minerals?|mining)\s+${LEGAL_ENTITY_SUFFIX}\b|\bpolymer(?:s)?(?:\s+\w+){0,3}\s+${LEGAL_ENTITY_SUFFIX}\b|\b${LEGAL_ENTITY_SUFFIX}\s+(?:resources?|silver|minerals?|mining|polymer(?:s)?)\b`,
);
const HEALTHCARE_NAME_PATTERN = new RegExp(
  String.raw`\b(?:bio|biotech|pharma|medtech|genomics|diagnostics?)\s+${LEGAL_ENTITY_SUFFIX}\b|\b${LEGAL_ENTITY_SUFFIX}\s+(?:bio|biotech|pharma|medtech|genomics|diagnostics?)\b`,
);
const CONSUMER_NAME_PATTERN = new RegExp(
  String.raw`\bfoods?\s+${LEGAL_ENTITY_SUFFIX}\b|\b${LEGAL_ENTITY_SUFFIX}\s+foods?\b`,
);
const TECHNOLOGY_NAME_PATTERN = new RegExp(
  String.raw`\bsensors?\s+${LEGAL_ENTITY_SUFFIX}\b|\b${LEGAL_ENTITY_SUFFIX}\s+sensors?\b`,
);
const CAPITAL_MARKETS_PATTERN = /capital markets|investment banking|securities broker|securities brokerage|brokerage|corporate finance|fondkommission/;
const TREASURY_FINANCE_PATTERN = /\btreasury\b/;

function startsWithAny(sic: string, prefixes: string[]): boolean {
  return prefixes.some((prefix) => sic.startsWith(prefix));
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
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
    || /(?:agents?|brokers?|agencies|brokerage) .*insurance/.test(text)
    || /\binsure?tech\b/.test(text);
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
  if (/\breal estate\b|property development|property management|fastigheter|fastighets/.test(text)) {
    return classified(
      "realEstate",
      "property_company",
      "Industry description identifies a non-REIT real-estate operating business; StockBox uses the property-company model instead of REIT-only FFO/AFFO or generic industrial methodology.",
      "description",
      0.82,
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
    || ENERGY_NAME_PATTERN.test(text)
  ) {
    const source = startsWithAny(sic, ENERGY_SICS) ? "sic" : "description";
    return classified("energy", "cyclical", `${source === "sic" ? "SIC" : "Industry description"} identifies a commodity-sensitive energy business.`, source, source === "sic" ? 0.95 : 0.84);
  }
  if (/basic materials|metals?|minerals?|mining|chemicals?|\bsilver\b/.test(text) || MATERIALS_NAME_PATTERN.test(text)) {
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
  const investmentCompany = startsWithAny(sic, INVESTMENT_COMPANY_SICS)
    || /investment holding|holding compan|investment compan(?:y|ies)|diversified investments?/.test(text)
    || HOLDING_VEHICLE_NAME_PATTERN.test(text)
    || (LEGAL_HOLDING_SUFFIX_PATTERN.test(text) && /asset management|investment management|financial services|investment/.test(description.toLowerCase()))
    || /\bbusiness development compan(?:y|ies)\b|\bbdc\b|\bspecialty lending\b/.test(text);
  if (investmentCompany) {
    const source = startsWithAny(sic, INVESTMENT_COMPANY_SICS) ? "sic" : "description";
    return classified(
      "financials",
      "holding_company",
      `${source === "sic" ? "SIC" : "Industry description"} identifies an investment company, BDC, specialty lender, or holding company that requires NAV/SOTP-style coverage.`,
      source,
      source === "sic" ? 0.92 : 0.86,
    );
  }
  if (/electronic gaming|gaming\s*(?:&|and)\s*multimedia|interactive media|video games?|\bgames?\b/.test(text)) {
    return classified("communication", "standard", "Industry description identifies an interactive gaming or multimedia business.", "description", 0.82);
  }
  if (
    /semiconductor|computer|electronic|communication equipment|information technology services|\bit services\b|scientific\s*(?:&|and)\s*technical instruments|scientific instruments/.test(text)
    || TECHNOLOGY_NAME_PATTERN.test(text)
  ) {
    return classified("technology", "standard", "Industry description identifies an operating technology, IT-services, instrumentation or communications-equipment company.", "description", 0.8);
  }
  if (/internet retail|discount stores?|specialty retail|department stores?|consumer cyclical|consumer defensive/.test(text) || CONSUMER_NAME_PATTERN.test(text)) {
    return classified("consumer", "standard", "Industry description identifies a consumer retail or consumer-products business.", "description", 0.82);
  }
  if (/telecom|telecommunications?|communication services|wireless services/.test(text)) {
    return classified("communication", "standard", "Industry description identifies a communications-services business.", "description", 0.82);
  }
  if (
    /drug manufacturers?|pharmaceutical|\bpharma\b|medical devices?|diagnostics|genetic analysis|genomics|medtech|healthcare/.test(text)
    || HEALTHCARE_NAME_PATTERN.test(text)
  ) {
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
  if (CAPITAL_MARKETS_PATTERN.test(text)) {
    return classified("financials", "unknown", "Industry description identifies a capital-markets business; a specialized capital-markets model is required before corporate methodology can be used.", "description", 0.8);
  }
  if (TREASURY_FINANCE_PATTERN.test(text)) {
    return classified("financials", "unknown", "Industry description identifies a credit-services or specialty-finance business; a specialized lender/receivables model is required before corporate methodology can be used.", "description", 0.8);
  }
  if (/asset management|investment management|investment advisers?/.test(text)) {
    return classified("financials", "asset_manager", "Industry description identifies an asset-management operating business; StockBox uses the asset-manager model instead of balance-sheet-bank or holding-company methodology.", "description", 0.82);
  }
  if (/credit services|consumer finance|loan servicing|receivables management|debt collection/.test(text)) {
    return classified("financials", "unknown", "Industry description identifies a credit-services or specialty-finance business; a specialized lender/receivables model is required before corporate methodology can be used.", "description", 0.8);
  }
  if (/shell compan(?:y|ies)|blank check|special purpose acquisition|\bspac\b/.test(text)) {
    return classified("financials", "unknown", "Industry description identifies a shell or acquisition company; a specialized pre-combination vehicle model is required before corporate methodology can be used.", "description", 0.8);
  }
  if (/financial conglomerates?/.test(text)) {
    return classified("financials", "unknown", "Industry description identifies a financial conglomerate; a specialized diversified-financial model is required before corporate methodology can be used.", "description", 0.8);
  }
  if (/financial services|finance compan|broker/.test(text)) {
    return classified("financials", "unknown", "Financial-services wording is not specific enough to select a bank, insurer, asset-manager, or holding-company model.", "description", 0.35);
  }
  if (/security\s*(?:&|and)\s*protection services|specialty business services|tools?\s*(?:&|and)\s*accessories|manufactur|industrial machinery|aerospace|defen[cs]e|construction|electrical equipment|conglomerates?/.test(text)) {
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
    return /\breit\b|real estate investment trusts?/i.test(input.industry ?? "") ? "reit" : "property_company";
  }
  if (input.sector === "utilities") return "utility";
  if (input.sector === "energy" || input.sector === "materials") return "cyclical";
  if (input.sector === "technology" && /software|cloud|saas/i.test(input.industry ?? "")) {
    return "software_growth";
  }
  return input.sector ? "standard" : "unknown";
}

function hasInvestmentHoldingFinancialSignature(input: FinancialAnalysisInput): boolean {
  const industryText = `${input.company.industry ?? ""} ${input.company.name ?? ""}`.toLowerCase();
  if (!/asset management|investment management|investment compan|investment holding|diversified investments?/.test(industryText)) return false;
  const periods = [...input.annualPeriods].filter((period) => period.fiscalYear !== undefined || period.periodEndDate).slice(-3);
  if (periods.length < 2) return false;
  const holdingLike = periods.filter((period) => {
    if (!isFiniteNumber(period.netIncome) || !isFiniteNumber(period.totalAssets) || !isFiniteNumber(period.totalEquity) || period.totalAssets <= 0) return false;
    const nonOperatingStatement = !isFiniteNumber(period.grossProfit) && !isFiniteNumber(period.operatingIncome) && !isFiniteNumber(period.operatingCashFlow);
    const equityHeavy = period.totalEquity / period.totalAssets >= 0.5;
    const stronglyEquityHeavy = period.totalEquity / period.totalAssets >= 0.65;
    const investmentIncomeDominant = !isFiniteNumber(period.revenue) || Math.abs(period.netIncome) >= Math.max(Math.abs(period.revenue), 1) * 0.35;
    const reportedInvestmentGainsDominant = isFiniteNumber(period.revenue)
      && Math.abs(period.netIncome) >= Math.max(Math.abs(period.revenue), 1) * 0.75
      && (!isFiniteNumber(period.operatingCashFlow) || Math.abs(period.operatingCashFlow) <= Math.abs(period.netIncome) * 0.5);
    return (nonOperatingStatement && equityHeavy && investmentIncomeDominant)
      || (stronglyEquityHeavy && reportedInvestmentGainsDominant);
  });
  return holdingLike.length >= 2;
}

function hasOperatingAssetManagerFinancialSignature(input: FinancialAnalysisInput): boolean {
  const industryText = `${input.company.industry ?? ""} ${input.company.name ?? ""}`.toLowerCase();
  if (!/asset management|investment management|investment advisers?/.test(industryText)) return false;
  const periods = [...input.annualPeriods].filter((period) => period.fiscalYear !== undefined || period.periodEndDate).slice(-3);
  if (periods.length < 2) return false;
  const operatingLike = periods.filter((period) => {
    return isFiniteNumber(period.revenue)
      && period.revenue > 0
      && isFiniteNumber(period.operatingIncome)
      && isFiniteNumber(period.grossProfit)
      && isFiniteNumber(period.operatingCashFlow);
  });
  return operatingLike.length >= 2;
}

function hasConventionalOperatingFinancialSignature(input: FinancialAnalysisInput): boolean {
  const diagnostics = input.company.classificationDiagnostics;
  if (diagnostics?.source !== "fallback" || diagnostics.ambiguous || diagnostics.confidence > 0.35) return false;
  if (input.company.sector === "financials" || input.company.sector === "realEstate") return false;

  const companyText = `${input.company.industry ?? ""} ${input.company.name ?? ""}`.toLowerCase();
  if (
    CAPITAL_MARKETS_PATTERN.test(companyText)
    || TREASURY_FINANCE_PATTERN.test(companyText)
    || /asset management|investment management|investment advisers?|investment holding|holding compan|investment compan(?:y|ies)|diversified investments?|\bbusiness development compan(?:y|ies)\b|\bbdc\b|\bspecialty lending\b|financial services|finance compan|credit services|consumer finance|loan servicing|receivables management|debt collection|shell compan(?:y|ies)|blank check|special purpose acquisition|\bspac\b|\bbanks?\b|banking|insurance|reinsurance|reinsurer|\breit\b|real estate investment trust|biotechnology|biological products|development stage|pre-revenue/.test(companyText)
  ) {
    return false;
  }

  const periods = [...input.annualPeriods].filter((period) => period.fiscalYear !== undefined || period.periodEndDate).slice(-3);
  if (periods.length < 2) return false;

  const operatingLike = periods.filter((period) => {
    const hasOperatingStatement = isFiniteNumber(period.grossProfit)
      || isFiniteNumber(period.operatingIncome)
      || isFiniteNumber(period.operatingCashFlow)
      || isFiniteNumber(period.ebitda);
    return isFiniteNumber(period.revenue)
      && period.revenue > 0
      && hasOperatingStatement
      && isFiniteNumber(period.totalAssets)
      && period.totalAssets > 0
      && isFiniteNumber(period.totalEquity);
  });
  return operatingLike.length >= 2;
}

function hasConfidentUnresolvedSpecialistStop(input: FinancialAnalysisInput): boolean {
  const diagnostics = input.company.classificationDiagnostics;
  if (!diagnostics || diagnostics.ambiguous || diagnostics.confidence < 0.6) return false;
  if (diagnostics.candidates.some((candidate) => candidate !== "unknown")) return false;
  return /capital-markets|credit-services|shell|acquisition company|diversified-financial|financial conglomerate/.test(
    diagnostics.reason.toLowerCase(),
  );
}

export function resolveFinancialClassificationDiagnostics(input: FinancialAnalysisInput): ArchetypeClassificationDiagnostics | undefined {
  const diagnostics = input.company.classificationDiagnostics;
  const base = resolveArchetype(input.company);
  if (base === "unknown" && hasConventionalOperatingFinancialSignature(input)) {
    return {
      reason: "Repeated reported revenue, operating-statement and balance-sheet facts support the standard operating-company model despite unavailable SIC or industry metadata.",
      source: "fallback",
      confidence: 0.65,
      ambiguous: false,
      candidates: ["standard"],
    };
  }
  return diagnostics;
}

export function resolveFinancialArchetype(input: FinancialAnalysisInput): AnalysisArchetype {
  const base = resolveArchetype(input.company);
  if (base === "pre_revenue_biotech") return base;
  if ((base === "unknown" || base === "asset_manager") && hasInvestmentHoldingFinancialSignature(input)) return "holding_company";
  if (base === "unknown" && hasConfidentUnresolvedSpecialistStop(input)) return base;
  if (base === "unknown" && hasOperatingAssetManagerFinancialSignature(input)) return "asset_manager";
  if (base === "unknown" && hasConventionalOperatingFinancialSignature(input)) return "standard";
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
  return !["bank", "insurer", "reit", "property_company", "asset_manager", "pre_revenue_biotech", "holding_company", "unknown"].includes(
    archetype,
  );
}
