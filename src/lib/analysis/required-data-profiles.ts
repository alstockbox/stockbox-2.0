import type { AnalysisArchetype, FinancialAnalysisInput } from "./types";

export type CoverageMetricKey =
  | "revenue"
  | "grossProfit"
  | "operatingIncome"
  | "netIncome"
  | "operatingCashFlow"
  | "capitalExpenditures"
  | "freeCashFlow"
  | "cashAndEquivalents"
  | "totalDebt"
  | "totalEquity"
  | "currentSharesOutstanding"
  | "marketPrice"
  | "marketCap"
  | "stockBasedCompensation"
  | "researchAndDevelopment"
  | "arr"
  | "retention"
  | "netInterestMargin"
  | "cet1CapitalRatio"
  | "grossLoans"
  | "deposits"
  | "nonPerformingLoans"
  | "loanLossProvisions"
  | "returnOnEquity"
  | "tangibleBookValuePerShare"
  | "combinedRatio"
  | "regulatoryCapitalRatio"
  | "reserveDevelopment"
  | "fundsFromOperations"
  | "adjustedFundsFromOperations"
  | "occupancy"
  | "sameStoreNoiGrowth"
  | "netDebtToEbitdare"
  | "fixedChargeCoverage"
  | "productionVolume"
  | "reserves"
  | "costOfProduction";

export type CoverageRequirement = {
  key: CoverageMetricKey;
  label: string;
  weight: number;
  critical?: boolean;
  /**
   * Conditional metrics are tracked when reported/available but do not reduce
   * the hard coverage denominator merely because the current provider contract
   * cannot prove the company reports them.
   */
  requiredWhenReported?: boolean;
};

export type CoverageProfileId =
  | AnalysisArchetype
  | "mining";

export type RequiredDataProfile = {
  id: CoverageProfileId;
  label: string;
  requirements: CoverageRequirement[];
};

const coreCorporate: CoverageRequirement[] = [
  { key: "revenue", label: "Revenue", weight: 12, critical: true },
  { key: "operatingIncome", label: "Operating income", weight: 8 },
  { key: "netIncome", label: "Net income", weight: 8 },
  { key: "operatingCashFlow", label: "Operating cash flow", weight: 10, critical: true },
  { key: "capitalExpenditures", label: "Capital expenditures", weight: 6 },
  { key: "freeCashFlow", label: "Free cash flow", weight: 10, critical: true },
  { key: "cashAndEquivalents", label: "Cash and equivalents", weight: 8 },
  { key: "totalDebt", label: "Total debt", weight: 8, critical: true },
  { key: "totalEquity", label: "Total equity", weight: 6 },
  { key: "currentSharesOutstanding", label: "Current shares outstanding", weight: 8, critical: true },
  { key: "marketPrice", label: "Current market price", weight: 8, critical: true },
  { key: "marketCap", label: "Market capitalization", weight: 8, critical: true },
];

const standard: RequiredDataProfile = {
  id: "standard",
  label: "Standard operating company",
  requirements: coreCorporate,
};

const softwareGrowth: RequiredDataProfile = {
  id: "software_growth",
  label: "Software / SaaS growth company",
  requirements: [
    { key: "revenue", label: "Revenue", weight: 14, critical: true },
    { key: "grossProfit", label: "Gross profit", weight: 10, critical: true },
    { key: "operatingIncome", label: "Operating income", weight: 7 },
    { key: "operatingCashFlow", label: "Operating cash flow", weight: 9 },
    { key: "freeCashFlow", label: "Free cash flow", weight: 12, critical: true },
    { key: "cashAndEquivalents", label: "Cash and equivalents", weight: 8 },
    { key: "totalDebt", label: "Total debt", weight: 7 },
    { key: "currentSharesOutstanding", label: "Current shares outstanding", weight: 8, critical: true },
    { key: "stockBasedCompensation", label: "Stock-based compensation", weight: 7 },
    { key: "researchAndDevelopment", label: "Research and development", weight: 5 },
    { key: "marketPrice", label: "Current market price", weight: 7, critical: true },
    { key: "marketCap", label: "Market capitalization", weight: 6, critical: true },
    { key: "arr", label: "Annual recurring revenue", weight: 0, requiredWhenReported: true },
    { key: "retention", label: "Customer retention", weight: 0, requiredWhenReported: true },
  ],
};

const bank: RequiredDataProfile = {
  id: "bank",
  label: "Bank",
  requirements: [
    { key: "netInterestMargin", label: "Net interest margin", weight: 13, critical: true },
    { key: "cet1CapitalRatio", label: "CET1 capital ratio", weight: 15, critical: true },
    { key: "grossLoans", label: "Gross loans", weight: 10 },
    { key: "deposits", label: "Deposits", weight: 10 },
    { key: "nonPerformingLoans", label: "Non-performing loans", weight: 10, critical: true },
    { key: "loanLossProvisions", label: "Loan loss provisions", weight: 10 },
    { key: "returnOnEquity", label: "Return on equity", weight: 10 },
    { key: "tangibleBookValuePerShare", label: "Tangible book value per share", weight: 8 },
    { key: "marketPrice", label: "Current market price", weight: 7, critical: true },
    { key: "marketCap", label: "Market capitalization", weight: 7 },
  ],
};

const insurer: RequiredDataProfile = {
  id: "insurer",
  label: "Insurance company",
  requirements: [
    { key: "combinedRatio", label: "Combined ratio", weight: 15, critical: true },
    { key: "returnOnEquity", label: "Return on equity", weight: 12 },
    { key: "regulatoryCapitalRatio", label: "Regulatory capital ratio", weight: 15, critical: true },
    { key: "reserveDevelopment", label: "Reserve development", weight: 12, critical: true },
    { key: "totalEquity", label: "Total equity", weight: 10 },
    { key: "netIncome", label: "Net income", weight: 10 },
    { key: "currentSharesOutstanding", label: "Current shares outstanding", weight: 8 },
    { key: "marketPrice", label: "Current market price", weight: 9, critical: true },
    { key: "marketCap", label: "Market capitalization", weight: 9 },
  ],
};

const reit: RequiredDataProfile = {
  id: "reit",
  label: "REIT",
  requirements: [
    { key: "fundsFromOperations", label: "Funds from operations", weight: 15, critical: true },
    { key: "adjustedFundsFromOperations", label: "Adjusted funds from operations", weight: 12 },
    { key: "occupancy", label: "Occupancy", weight: 10 },
    { key: "sameStoreNoiGrowth", label: "Same-store NOI growth", weight: 10 },
    { key: "netDebtToEbitdare", label: "Net debt / EBITDAre", weight: 13, critical: true },
    { key: "fixedChargeCoverage", label: "Fixed-charge coverage", weight: 10, critical: true },
    { key: "currentSharesOutstanding", label: "Current shares outstanding", weight: 10 },
    { key: "marketPrice", label: "Current market price", weight: 10, critical: true },
    { key: "marketCap", label: "Market capitalization", weight: 10 },
  ],
};

const mining: RequiredDataProfile = {
  id: "mining",
  label: "Mining company",
  requirements: [
    ...coreCorporate.map((item) => ({ ...item, weight: Math.max(1, Math.round(item.weight * 0.55)) })),
    { key: "productionVolume", label: "Production volume", weight: 0, requiredWhenReported: true },
    { key: "reserves", label: "Reserves / resources", weight: 0, requiredWhenReported: true },
    { key: "costOfProduction", label: "Cost of production", weight: 0, requiredWhenReported: true },
  ],
};

const corporateProfile = (id: AnalysisArchetype, label: string): RequiredDataProfile => ({
  id,
  label,
  requirements: coreCorporate,
});

export const REQUIRED_DATA_PROFILES: Record<CoverageProfileId, RequiredDataProfile> = {
  standard,
  software_growth: softwareGrowth,
  bank,
  insurer,
  reit,
  property_company: corporateProfile("property_company", "Property company"),
  asset_manager: corporateProfile("asset_manager", "Asset manager"),
  utility: corporateProfile("utility", "Utility"),
  cyclical: corporateProfile("cyclical", "Cyclical company"),
  pre_revenue_biotech: {
    id: "pre_revenue_biotech",
    label: "Pre-revenue biotechnology company",
    requirements: [
      { key: "operatingCashFlow", label: "Operating cash flow", weight: 18, critical: true },
      { key: "freeCashFlow", label: "Free cash flow", weight: 15 },
      { key: "cashAndEquivalents", label: "Cash and equivalents", weight: 20, critical: true },
      { key: "totalDebt", label: "Total debt", weight: 12 },
      { key: "researchAndDevelopment", label: "Research and development", weight: 15, critical: true },
      { key: "currentSharesOutstanding", label: "Current shares outstanding", weight: 8 },
      { key: "marketPrice", label: "Current market price", weight: 6 },
      { key: "marketCap", label: "Market capitalization", weight: 6 },
    ],
  },
  holding_company: corporateProfile("holding_company", "Holding company"),
  unknown: {
    id: "unknown",
    label: "Unresolved company type",
    requirements: [],
  },
  mining,
};

const miningPattern = /\b(mining|miner|mineral|metals?|gold|silver|copper|iron ore|lithium|nickel|zinc|uranium)\b/i;

export function resolveRequiredDataProfile(input: FinancialAnalysisInput): RequiredDataProfile {
  const archetype = input.company.analysisArchetype ?? "unknown";
  if (
    input.company.sector === "materials" &&
    miningPattern.test(`${input.company.industry ?? ""} ${input.company.name ?? ""}`)
  ) {
    return REQUIRED_DATA_PROFILES.mining;
  }
  return REQUIRED_DATA_PROFILES[archetype] ?? REQUIRED_DATA_PROFILES.unknown;
}
