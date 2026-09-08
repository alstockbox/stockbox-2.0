import type { AnalysisSource, CompanySearchResult, ProviderDiagnostic } from "@/lib/analysis/types";
import type { InvestmentCompanyDirectorGovernanceEvidence } from "./investment-company-governance";

const REQUEST_TIMEOUT_MS = 10_000;
const PROVIDER_ID = "official-investment-company-governance";
const PROVIDER_VERSION = "official-investment-company-governance-v1";
const INDUSTRIVARDEN_BOARD_URL = "https://www.industrivarden.se/en-gb/corporate-governance/board-of-directors/board-of-directors/";
const INDUSTRIVARDEN_INDEPENDENCE_STATEMENT_URL = "https://www.industrivarden.se/globalassets/arsstamma/2026/engelska/05b_nominating-committees-proposals-report-and-statement.pdf";

const INDUSTRIVARDEN_2026_DIRECTORS: InvestmentCompanyDirectorGovernanceEvidence[] = [
  { name: "Fredrik Lundberg", independentFromCompanyManagement: true, independentFromMajorShareholders: false },
  { name: "Pär Boman", independentFromCompanyManagement: true, independentFromMajorShareholders: true },
  { name: "Christian Caspar", independentFromCompanyManagement: true, independentFromMajorShareholders: true },
  { name: "Marika Fredriksson", independentFromCompanyManagement: true, independentFromMajorShareholders: true },
  { name: "Bengt Kjell", independentFromCompanyManagement: true, independentFromMajorShareholders: true },
  { name: "Katarina Martinson", independentFromCompanyManagement: true, independentFromMajorShareholders: false },
  { name: "Fredrik Persson", independentFromCompanyManagement: true, independentFromMajorShareholders: true },
  { name: "Lars Pettersson", independentFromCompanyManagement: true, independentFromMajorShareholders: false },
  { name: "Helena Stjernholm", independentFromCompanyManagement: false, independentFromMajorShareholders: true },
];

export type OfficialInvestmentCompanyGovernanceData = {
  directors: InvestmentCompanyDirectorGovernanceEvidence[];
  asOf: string;
  sources: AnalysisSource[];
  diagnostic: ProviderDiagnostic;
};

export type OfficialInvestmentCompanyGovernanceResult =
  | { ok: true; data: OfficialInvestmentCompanyGovernanceData }
  | { ok: false; reason: string; message: string; diagnostic: ProviderDiagnostic };

function diagnostic(status: ProviderDiagnostic["status"], reason?: string): ProviderDiagnostic {
  return {
    provider: "Official investment-company governance",
    capability: "specialized",
    status,
    reason,
    observedAt: new Date().toISOString(),
  };
}

function normalizeIdentity(company: CompanySearchResult): string {
  return `${company.canonicalTicker ?? company.ticker} ${company.ticker} ${company.name}`
    .toLocaleLowerCase("en-US")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeDirectorName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&aring;|&#229;/gi, "å")
    .replace(/&auml;|&#228;/gi, "ä")
    .replace(/&ouml;|&#246;/gi, "ö")
    .replace(/&Aring;|&#197;/g, "Å")
    .replace(/&Auml;|&#196;/g, "Ä")
    .replace(/&Ouml;|&#214;/g, "Ö");
}

function htmlToText(value: string): string {
  return decodeHtml(value)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseIndustrivardenOfficialBoardRoster(html: string): string[] | null {
  const text = htmlToText(html);
  const boardHeadingIndex = text.toLocaleLowerCase("en-US").indexOf("board of directors");
  if (boardHeadingIndex < 0) return null;

  const afterHeading = text.slice(boardHeadingIndex + "board of directors".length);
  const lastUpdateIndex = afterHeading.toLocaleLowerCase("en-US").indexOf("last update");
  const boardText = lastUpdateIndex >= 0 ? afterHeading.slice(0, lastUpdateIndex) : afterHeading;
  const names: string[] = [];
  const seen = new Set<string>();
  const directorPattern = /([\p{Lu}][\p{L}\p{M}.'’\-]+(?:\s+[\p{Lu}][\p{L}\p{M}.'’\-]+){1,4})\s*\((?:19|20)\d{2}\)/gu;
  let match: RegExpExecArray | null;
  while ((match = directorPattern.exec(boardText)) !== null) {
    const name = match[1].trim().replace(/^Board\s+/u, "").replace(/\s+/g, " ");
    const normalized = normalizeDirectorName(name);
    if (!seen.has(normalized)) {
      seen.add(normalized);
      names.push(name);
    }
  }
  return names.length ? names : null;
}

function rosterMatchesVerifiedEvidence(currentRoster: string[]): boolean {
  if (currentRoster.length !== INDUSTRIVARDEN_2026_DIRECTORS.length) return false;
  const current = new Set(currentRoster.map(normalizeDirectorName));
  const verified = new Set(INDUSTRIVARDEN_2026_DIRECTORS.map((director) => normalizeDirectorName(director.name)));
  return current.size === verified.size && [...current].every((name) => verified.has(name));
}

function failure(reason: string, message: string): OfficialInvestmentCompanyGovernanceResult {
  return { ok: false, reason, message, diagnostic: diagnostic("unavailable", reason) };
}

export async function fetchOfficialInvestmentCompanyGovernance(
  company: CompanySearchResult,
): Promise<OfficialInvestmentCompanyGovernanceResult> {
  const identity = normalizeIdentity(company);
  const isIndustrivarden = /\bindu(?:-[ac])?\.st\b/.test(identity)
    || identity.includes("industrivärden")
    || identity.includes("industrivarden");
  if (!isIndustrivarden) {
    return failure(
      "official_governance_adapter_not_configured",
      "No verified official governance adapter is configured for this investment company.",
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(INDUSTRIVARDEN_BOARD_URL, {
      cache: "no-store",
      headers: { accept: "text/html,application/xhtml+xml" },
      signal: controller.signal,
    });
    if (!response.ok) {
      return failure(
        response.status === 429 ? "rate_limited" : `http_${response.status}`,
        "The current official Industrivärden board page could not be fetched for governance revalidation.",
      );
    }

    const roster = parseIndustrivardenOfficialBoardRoster(await response.text());
    if (!roster || !rosterMatchesVerifiedEvidence(roster)) {
      return failure(
        "official_governance_roster_changed",
        "The current official Industrivärden board roster no longer matches the versioned independence evidence; governance remains N/A until the evidence is reverified.",
      );
    }

    const accessedAt = new Date().toISOString();
    const asOf = accessedAt.slice(0, 10);
    const sources: AnalysisSource[] = [
      {
        name: "Industrivärden current Board of Directors",
        url: INDUSTRIVARDEN_BOARD_URL,
        accessedAt,
        freshness: "Live official board roster revalidated at analysis time with cache disabled.",
        provider: PROVIDER_ID,
        version: PROVIDER_VERSION,
        capability: "specialized",
        dataAsOf: asOf,
      },
      {
        name: "Industrivärden 2026 Nominating Committee independence statement",
        url: INDUSTRIVARDEN_INDEPENDENCE_STATEMENT_URL,
        accessedAt,
        freshness: "Versioned 2026 issuer nomination-committee independence evidence; usable only while the live board roster still matches exactly.",
        provider: PROVIDER_ID,
        version: PROVIDER_VERSION,
        capability: "specialized",
        dataAsOf: asOf,
      },
    ];

    return {
      ok: true,
      data: {
        directors: INDUSTRIVARDEN_2026_DIRECTORS.map((director) => ({ ...director })),
        asOf,
        sources,
        diagnostic: diagnostic("available"),
      },
    };
  } catch (error) {
    return failure(
      error instanceof Error && error.name === "AbortError" ? "timeout" : "upstream_error",
      "Official Industrivärden governance verification failed before complete board evidence could be established.",
    );
  } finally {
    clearTimeout(timeout);
  }
}
