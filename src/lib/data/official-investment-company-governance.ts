import type { AnalysisSource, CompanySearchResult, ProviderDiagnostic } from "@/lib/analysis/types";
import type { InvestmentCompanyDirectorGovernanceEvidence } from "./investment-company-governance";

const REQUEST_TIMEOUT_MS = 10_000;
const PROVIDER_ID = "official-investment-company-governance";
const PROVIDER_VERSION = "official-investment-company-governance-v1";
const INDUSTRIVARDEN_BOARD_URL = "https://www.industrivarden.se/en-gb/corporate-governance/board-of-directors/board-of-directors/";
const INDUSTRIVARDEN_INDEPENDENCE_STATEMENT_URL = "https://www.industrivarden.se/globalassets/arsstamma/2026/engelska/05b_nominating-committees-proposals-report-and-statement.pdf";
const INVESTOR_BOARD_URL = "https://www.investorab.com/about-investor/board-management/board-of-directors";
const INVESTOR_INDEPENDENCE_STATEMENT_URL = "https://www.investorab.com/media/e3hbxzb5/information-about-proposed-board-of-directors-2026.pdf";
const INVESTOR_INDEPENDENCE_AS_OF = "2026-05-07";
const LATOUR_BOARD_URL = "https://www.latour.se/en/corporate-governance/the-board-of-directors";
const LATOUR_INDEPENDENCE_STATEMENT_URL = "https://www.latour.se/~/media/Files/L/latour/documents/mtn-program/prospectus/Latour%20-%20Base%20Prospectus%2013%20February%202026%20FINAL%20locked.pdf";
const LATOUR_INDEPENDENCE_AS_OF = "2026-02-13";

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

const INVESTOR_2026_DIRECTORS: InvestmentCompanyDirectorGovernanceEvidence[] = [
  { name: "Jacob Wallenberg", independentFromCompanyManagement: true, independentFromMajorShareholders: false },
  { name: "Marcus Wallenberg", independentFromCompanyManagement: true, independentFromMajorShareholders: false },
  { name: "Christian Cederholm", independentFromCompanyManagement: false, independentFromMajorShareholders: true },
  { name: "Katarina Berg", independentFromCompanyManagement: true, independentFromMajorShareholders: true },
  { name: "Magdalena Gerger", independentFromCompanyManagement: true, independentFromMajorShareholders: true },
  { name: "Sven Nyman", independentFromCompanyManagement: true, independentFromMajorShareholders: true },
  { name: "Mats Rahmström", independentFromCompanyManagement: false, independentFromMajorShareholders: false },
  { name: "Grace Reksten Skaugen", independentFromCompanyManagement: true, independentFromMajorShareholders: true },
  { name: "Hans Stråberg", independentFromCompanyManagement: true, independentFromMajorShareholders: true },
  { name: "Fred Wallenberg", independentFromCompanyManagement: false, independentFromMajorShareholders: false },
  { name: "Sara Öhrvall", independentFromCompanyManagement: true, independentFromMajorShareholders: true },
];

const LATOUR_2026_DIRECTORS: InvestmentCompanyDirectorGovernanceEvidence[] = [
  { name: "Johan Nordström", independentFromCompanyManagement: true, independentFromMajorShareholders: true },
  { name: "Mariana Burenstam Linder", independentFromCompanyManagement: true, independentFromMajorShareholders: true },
  { name: "Anders Böös", independentFromCompanyManagement: true, independentFromMajorShareholders: true },
  { name: "Carl Douglas", independentFromCompanyManagement: true, independentFromMajorShareholders: false },
  { name: "Eric Douglas", independentFromCompanyManagement: true, independentFromMajorShareholders: false },
  { name: "Johan Hjertonsson", independentFromCompanyManagement: false, independentFromMajorShareholders: true },
  { name: "Lena Olving", independentFromCompanyManagement: true, independentFromMajorShareholders: true },
  { name: "Hélène Barnekow", independentFromCompanyManagement: true, independentFromMajorShareholders: true },
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

type GovernanceIssuerConfig = {
  issuerName: string;
  boardUrl: string;
  evidenceUrl: string;
  evidenceAsOf?: string;
  directors: InvestmentCompanyDirectorGovernanceEvidence[];
  parseRoster: (html: string) => string[] | null;
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

export function parseInvestorOfficialBoardRoster(html: string): string[] | null {
  const text = htmlToText(html);
  if (!/\bboard of directors\b/i.test(text)) return null;

  const names: string[] = [];
  const seen = new Set<string>();
  const anchorPattern = /<a\b[^>]*href=["'][^"']*\/about-investor\/board-management\/board-of-directors\/[^"'/?#]+\/?["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = anchorPattern.exec(html)) !== null) {
    const raw = htmlToText(match[1]);
    const name = raw.replace(/^Read More About\s+/i, "").trim().replace(/\s+/g, " ");
    if (!name) continue;
    const normalized = normalizeDirectorName(name);
    if (!seen.has(normalized)) {
      seen.add(normalized);
      names.push(name);
    }
  }

  return names.length === INVESTOR_2026_DIRECTORS.length ? names : null;
}

export function parseLatourOfficialBoardRoster(html: string): string[] | null {
  const text = htmlToText(html);
  if (!/\bboard of latour consists of eight regular members,\s*includ(?:ing|ig) the ceo\b/i.test(text)) return null;
  if (!/annual general meeting in 2026,\s*johan nordström was elected chairman of the board/i.test(text)) return null;
  if (!/two of the members are not independent of the company['’]s largest owner,\s*eric douglas and carl douglas/i.test(text)) return null;

  const independenceMarkers = [...text.matchAll(/\bIndependent:\s*(Yes|No)\b/gi)];
  if (independenceMarkers.length !== LATOUR_2026_DIRECTORS.length) return null;

  const names: string[] = [];
  const seen = new Set<string>();
  let previousMarkerEnd = 0;

  for (const marker of independenceMarkers) {
    const markerIndex = marker.index ?? -1;
    if (markerIndex < 0) return null;
    const window = text.slice(previousMarkerEnd, markerIndex);
    const normalizedWindow = window.toLocaleLowerCase("en-US");
    let director: InvestmentCompanyDirectorGovernanceEvidence | null = null;
    let nearestIndex = -1;

    for (const candidate of LATOUR_2026_DIRECTORS) {
      const candidateIndex = normalizedWindow.lastIndexOf(normalizeDirectorName(candidate.name));
      if (candidateIndex > nearestIndex) {
        director = candidate;
        nearestIndex = candidateIndex;
      }
    }

    if (!director || nearestIndex < 0) return null;
    const normalizedName = normalizeDirectorName(director.name);
    if (seen.has(normalizedName)) return null;

    const expectedCombinedIndependence = director.independentFromCompanyManagement === true
      && director.independentFromMajorShareholders === true
      ? "yes"
      : "no";
    if ((marker[1] ?? "").toLocaleLowerCase("en-US") !== expectedCombinedIndependence) return null;

    seen.add(normalizedName);
    names.push(director.name);
    previousMarkerEnd = markerIndex + marker[0].length;
  }

  return names.length === LATOUR_2026_DIRECTORS.length ? names : null;
}

function rosterMatchesVerifiedEvidence(
  currentRoster: string[],
  verifiedDirectors: InvestmentCompanyDirectorGovernanceEvidence[],
): boolean {
  if (currentRoster.length !== verifiedDirectors.length) return false;
  const current = new Set(currentRoster.map(normalizeDirectorName));
  const verified = new Set(verifiedDirectors.map((director) => normalizeDirectorName(director.name)));
  return current.size === verified.size && [...current].every((name) => verified.has(name));
}

function failure(reason: string, message: string): OfficialInvestmentCompanyGovernanceResult {
  return { ok: false, reason, message, diagnostic: diagnostic("unavailable", reason) };
}

function issuerConfig(company: CompanySearchResult): GovernanceIssuerConfig | null {
  const identity = normalizeIdentity(company);
  const isIndustrivarden = /\bindu(?:-[ac])?\.st\b/.test(identity)
    || identity.includes("industrivärden")
    || identity.includes("industrivarden");
  if (isIndustrivarden) {
    return {
      issuerName: "Industrivärden",
      boardUrl: INDUSTRIVARDEN_BOARD_URL,
      evidenceUrl: INDUSTRIVARDEN_INDEPENDENCE_STATEMENT_URL,
      directors: INDUSTRIVARDEN_2026_DIRECTORS,
      parseRoster: parseIndustrivardenOfficialBoardRoster,
    };
  }

  const isInvestor = /\binve(?:-[ab])?\.st\b/.test(identity) || identity.includes("investor ab");
  if (isInvestor) {
    return {
      issuerName: "Investor",
      boardUrl: INVESTOR_BOARD_URL,
      evidenceUrl: INVESTOR_INDEPENDENCE_STATEMENT_URL,
      evidenceAsOf: INVESTOR_INDEPENDENCE_AS_OF,
      directors: INVESTOR_2026_DIRECTORS,
      parseRoster: parseInvestorOfficialBoardRoster,
    };
  }

  const isLatour = /\blato(?:-[ab])?\.st\b/.test(identity) || identity.includes("investment ab latour");
  if (isLatour) {
    return {
      issuerName: "Latour",
      boardUrl: LATOUR_BOARD_URL,
      evidenceUrl: LATOUR_INDEPENDENCE_STATEMENT_URL,
      evidenceAsOf: LATOUR_INDEPENDENCE_AS_OF,
      directors: LATOUR_2026_DIRECTORS,
      parseRoster: parseLatourOfficialBoardRoster,
    };
  }

  return null;
}

export async function fetchOfficialInvestmentCompanyGovernance(
  company: CompanySearchResult,
): Promise<OfficialInvestmentCompanyGovernanceResult> {
  const config = issuerConfig(company);
  if (!config) {
    return failure(
      "official_governance_adapter_not_configured",
      "No verified official governance adapter is configured for this investment company.",
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(config.boardUrl, {
      cache: "no-store",
      headers: { accept: "text/html,application/xhtml+xml" },
      signal: controller.signal,
    });
    if (!response.ok) {
      return failure(
        response.status === 429 ? "rate_limited" : `http_${response.status}`,
        `The current official ${config.issuerName} board page could not be fetched for governance revalidation.`,
      );
    }

    const roster = config.parseRoster(await response.text());
    if (!roster || !rosterMatchesVerifiedEvidence(roster, config.directors)) {
      return failure(
        "official_governance_roster_changed",
        `The current official ${config.issuerName} board roster no longer matches the versioned independence evidence; governance remains N/A until the evidence is reverified.`,
      );
    }

    const accessedAt = new Date().toISOString();
    const asOf = accessedAt.slice(0, 10);
    const sources: AnalysisSource[] = [
      {
        name: `${config.issuerName} current Board of Directors`,
        url: config.boardUrl,
        accessedAt,
        freshness: "Live official board roster revalidated at analysis time with cache disabled.",
        provider: PROVIDER_ID,
        version: PROVIDER_VERSION,
        capability: "specialized",
        dataAsOf: asOf,
      },
      {
        name: `${config.issuerName} 2026 independence statement`,
        url: config.evidenceUrl,
        accessedAt,
        freshness: "Versioned 2026 issuer governance independence evidence; usable only while the live board roster still matches exactly.",
        provider: PROVIDER_ID,
        version: PROVIDER_VERSION,
        capability: "specialized",
        dataAsOf: config.evidenceAsOf ?? asOf,
      },
    ];

    return {
      ok: true,
      data: {
        directors: config.directors.map((director) => ({ ...director })),
        asOf,
        sources,
        diagnostic: diagnostic("available"),
      },
    };
  } catch (error) {
    return failure(
      error instanceof Error && error.name === "AbortError" ? "timeout" : "upstream_error",
      `Official ${config.issuerName} governance verification failed before complete board evidence could be established.`,
    );
  } finally {
    clearTimeout(timeout);
  }
}