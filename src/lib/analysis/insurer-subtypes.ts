import type { CompanyProfile, InsurerSubtype } from "./types";

export const INSURER_BASE_REQUIRED_FIELDS = [
  "premiumGrowth",
  "bookValue",
  "tangibleBookValue",
  "returnOnEquity",
  "regulatoryCapitalRatio",
];

export const INSURER_P_AND_C_REQUIRED_FIELDS = [
  ...INSURER_BASE_REQUIRED_FIELDS,
  "combinedRatio",
  "lossRatio",
  "expenseRatio",
  "reserveDevelopment",
];

export function resolveInsurerSubtype(company: CompanyProfile): InsurerSubtype {
  const sic = (company.sic ?? "").replace(/\D/g, "");
  const text = [company.industry, company.classificationDiagnostics?.reason]
    .filter(Boolean).join(" ").toLowerCase();
  const hasPc = /\bp&c\b|property\s*(?:and|&)\s*casualty|casualty|fire|marine|automobile|auto insurance|workers'? compensation|surety|title insurance/.test(text)
    || ["633", "635", "636"].some((prefix) => sic.startsWith(prefix));
  const hasLife = /\blife insurance\b|\blife insurer\b|annuities|annuity/.test(text) || sic.startsWith("631");
  const hasReinsurance = /reinsurance|reinsurer/.test(text);
  const explicitMixed = /multi[- ]?line|multiline|diversified insurance|composite insurer|mixed insurance/.test(text);

  const signals = [hasPc, hasLife, hasReinsurance].filter(Boolean).length;
  if (explicitMixed || signals > 1) return "mixed";
  if (hasPc) return "property_casualty";
  if (hasLife) return "life";
  if (hasReinsurance) return "reinsurance";
  return "unknown";
}

export function isPropertyCasualtyInsurer(company: CompanyProfile): boolean {
  return resolveInsurerSubtype(company) === "property_casualty";
}

export function insurerRequiredFields(company: CompanyProfile): string[] {
  return resolveInsurerSubtype(company) === "property_casualty"
    ? INSURER_P_AND_C_REQUIRED_FIELDS
    : INSURER_BASE_REQUIRED_FIELDS;
}

export function insurerSubtypeSupportsDirectional(company: CompanyProfile): boolean {
  const subtype = resolveInsurerSubtype(company);
  return subtype !== "unknown" && subtype !== "mixed";
}
