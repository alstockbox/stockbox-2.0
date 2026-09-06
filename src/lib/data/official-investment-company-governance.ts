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
  sources: AnalysisSource[];
  diagnostic: ProviderDiagnostic;
};

export type OfficialInvestmentCompanyGovernanceResult =
  | { ok: true; data: OfficialInvestmentCompanyGovernanceData }
  | { ok: false; reason: string; message: string; diagnostic: ProviderDiagnostic };

type OfficialGovernanceRegistryEntry = {
  id: "industrivarden";
  boardUrl: string;
  statementUrl: string;
  directors: InvestmentCompanyDirectorGovernanceEvidence[];
  matches: (company: CompanySearchResult) => boolean;
};

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
  return `${company.canonicalTicker ?? company.ticker} ${company.ticker} ${company.name}`.toLocaleLowerCase("en-US");
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
    const name = match[1].trim().replace(/\s+/g, " ");
    const normalized = normalizeDirectorName(name);
    if (!seen.has(normalized)) {
      names.push(name);
      seen.add(normalized);
    }
  }

  return names.length > 0 ? names : null;
}

const REGISTRY: OfficialGovernanceRegistryEntry[] = [
  {
    id: "industrivarden",
    boardUrl: INDUSTRIVARDEN_BOARD_URL,
    statementUrl: INDUSTRIVARDEN_INDEPENDENCE_STATEMENT_URL,
    directors: INDUSTRIVARDEN_2026_DIRECTORS,
    matches: (company) => {
      const identity = normalizeIdentity(company);
      return /\bindu(?:-[ac])?\.st\b/.test(identity)
        || identity.includes("industrivärden")
        || identity.includes("industrivarden");
    },
  },
];

function failure(reason: string, message: string): OfficialInvestmentCompanyGovernanceResult {
  return {
    ok: false,
    reason,
    message,
    diagnostic: diagnostic("unavailable", reason),
  };
}

function rosterMatchesVerifiedEvidence(
  currentRoster: string[],
  verifiedDirectors: InvestmentCompanyDirectorGovernanceEvidence[],
): boolean {
  if (currentRoster.length !== verifiedDirectors.length) return false;

  const current = new Set(currentRoster.map(normalizeDirectorName));
  const verified = new Set(verifiedDirectors.map((director) => normalizeDirectorName(director.name)));
  if (current.size !== currentRoster.length || verified.size !== verifiedDirectors.length) return false;
  return current.size === verified.size && [...current].every((name) => verified.has(name));
}

export async function fetchOfficialInvestmentCompanyGovernance(
  company: CompanySearchResult,
): Promise<OfficialInvestmentCompanyGovernanceResult> {
  const entry = REGISTRY.find((candidate) => candidate.matches(company));
  if (!entry) {
    return failure(
      "official_governance_adapter_not_configured",
      "No verified official governance adapter is configured for this investment company.",
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(entry.boardUrl, {
      cache: "no-store",
      headers: {
        accept: "text/html,application/xhtml+xml",
        "user-agent": "StockBox/2.0 official-governance-verifier",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      return failure(
        response.status === 429 ? "rate_limited" : `http_${response.status}`,
        "The current official investment-company board page could not be fetched for governance revalidation.",
      );
    }

    const currentRoster = parseIndustrivardenOfficialBoardRoster(await response.text());
    if (!currentRoster) {
      return failure(
        "industrivarden_current_board_roster_unavailable",
        "The current official Industrivärden board roster could not be parsed completely enough to revalidate governance evidence.",
      );
    }

    if (!rosterMatchesVerifiedEvidence(currentRoster, entry.directors)) {
      return failure(
        "industrivarden_current_board_roster_mismatch",
        "The current official Industrivärden board roster differs from the board covered by the verified 2026 independence statement.",
      );
    }

    const accessedAt = new Date().toISOString();
    const sources: AnalysisSource[] = [
      {
        name: "Industrivärden 2026 Nominating Committee independence statement",
        url: entry.statementUrl,
        accessedAt,
        freshness: "Versioned official 2026 independence evidence. It is used only while a live fetch of the official board page confirms the complete director roster still matches exactly.",
        provider: PROVIDER_ID,
        version: PROVIDER_VERSION,
        capability: "specialized",
      },
      {
        name: "Industrivärden current Board of Directors",
        url: entry.boardUrl,
        accessedAt,
        freshness: "Live official board roster fetched at analysis time with cache disabled; any roster drift invalidates the versioned independence evidence and fails closed.",
        provider: PROVIDER_ID,
        version: PROVIDER_VERSION,
        capability: "specialized",
      },
    ];

    return {
      ok: true,
      data: {
        directors: entry.directors.map((director) => ({ ...director })),
        sources,
        diagnostic: diagnostic("available"),
      },
    };
  } catch (error) {
    return failure(
      error instanceof Error && error.name === "AbortError" ? "timeout" : "upstream_error",
      "Official investment-company governance verification failed before the current board roster could be validated.",
    );
  } finally {
    clearTimeout(timeout);
  }
}
