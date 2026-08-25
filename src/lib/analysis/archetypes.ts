import type { AnalysisArchetype, Sector } from "./types";

const BANK_SICS = ["602", "603", "606", "608", "609", "611", "614", "615", "616", "617"];
const INSURANCE_SICS = ["631", "632", "633", "635", "636", "639", "641"];
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
}): { sector: Sector; industry: string | null; analysisArchetype: AnalysisArchetype } {
  const sic = (input.sic ?? "").replace(/\D/g, "");
  const description = (input.sicDescription ?? "").trim();
  const text = `${description} ${input.name ?? ""}`.toLowerCase();

  if (startsWithAny(sic, BANK_SICS) || /\b(bank|savings institution)\b/.test(text)) {
    return { sector: "financials", industry: description || null, analysisArchetype: "bank" };
  }
  if (startsWithAny(sic, INSURANCE_SICS) || /\binsurance\b/.test(text)) {
    return { sector: "financials", industry: description || null, analysisArchetype: "insurer" };
  }
  if (startsWithAny(sic, REIT_SICS) || /\breit\b|real estate investment trust/.test(text)) {
    return { sector: "realEstate", industry: description || null, analysisArchetype: "reit" };
  }
  if (startsWithAny(sic, UTILITY_SICS) || /electric services|natural gas distribution|water supply/.test(text)) {
    return { sector: "utilities", industry: description || null, analysisArchetype: "utility" };
  }
  if (startsWithAny(sic, ENERGY_SICS) || /petroleum|oil and gas|coal mining/.test(text)) {
    return { sector: "energy", industry: description || null, analysisArchetype: "cyclical" };
  }
  if (startsWithAny(sic, AUTOMOTIVE_SICS) || /motor vehicles?|automobiles?|passenger car/.test(text)) {
    return { sector: "industrials", industry: description || null, analysisArchetype: "cyclical" };
  }
  if (startsWithAny(sic, BIOTECH_SICS) || /biological products|biotechnology/.test(text)) {
    return {
      sector: "healthcare",
      industry: description || null,
      analysisArchetype: /development stage|pre-revenue/.test(text) ? "pre_revenue_biotech" : "standard",
    };
  }
  if (startsWithAny(sic, SOFTWARE_SICS) || /software|cloud computing/.test(text)) {
    return { sector: "technology", industry: description || null, analysisArchetype: "software_growth" };
  }
  if (/holding compan/.test(text)) {
    return { sector: "financials", industry: description || null, analysisArchetype: "holding_company" };
  }
  if (/semiconductor|computer|electronic/.test(text)) {
    return { sector: "technology", industry: description || null, analysisArchetype: "standard" };
  }
  if (/manufactur|retail|wholesale|services/.test(text)) {
    return { sector: "industrials", industry: description || null, analysisArchetype: "standard" };
  }

  return { sector: "other", industry: description || null, analysisArchetype: "unknown" };
}

export function resolveArchetype(input: {
  analysisArchetype?: AnalysisArchetype;
  sector?: Sector;
  industry?: string;
}): AnalysisArchetype {
  if (input.analysisArchetype) return input.analysisArchetype;
  if (input.sector === "financials") return "unknown";
  if (input.sector === "realEstate") return "reit";
  if (input.sector === "utilities") return "utility";
  if (input.sector === "energy" || input.sector === "materials") return "cyclical";
  if (input.sector === "technology" && /software|cloud|saas/i.test(input.industry ?? "")) {
    return "software_growth";
  }
  return input.sector ? "standard" : "unknown";
}

export function supportsFcffDcf(archetype: AnalysisArchetype): boolean {
  return !["bank", "insurer", "reit", "pre_revenue_biotech", "holding_company", "unknown"].includes(
    archetype,
  );
}
