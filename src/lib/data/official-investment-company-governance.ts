import type { AnalysisSource, CompanySearchResult, ProviderDiagnostic } from "@/lib/analysis/types";
import type { InvestmentCompanyDirectorGovernanceEvidence } from "./investment-company-governance";

const REQUEST_TIMEOUT_MS = 10_000;
const PROVIDER_ID = "official-investment-company-governance";
const PROVIDER_VERSION = "official-investment-company-governance-v1";

const INDUSTRIVARDEN_BOARD_URL = "https://www.industrivarden.se/en-gb/corporate-governance/board-of-directors/board-of-directors/";
const INDUSTRIVARDEN_INDEPENDENCE_STATEMENT_URL = "https://www.industrivarden.se/globalassets/arsstamma/2026/engelska/05b_nominating-committees-proposals-report-and-statement.pdf";
const INVESTOR_BOARD_URL = "https://www.investorab.com/about-investor/board-management/board-of-directors";
const INVESTOR_INDEPENDENCE_STATEMENT_URL = "https://www.investorab.com/media/e3hbxzb5/information-about-proposed-board-of-directors-2026.pdf";
const CREADES_BOARD_URL = "https://www.creades.se/bolagsstyrning/styrelse-ledande-befattningshavare-och-revisor/";
const CREADES_INDEPENDENCE_STATEMENT_URL = "https://www.creades.se/media/0mfj3ehw/valberedningens-f%C3%B6rslag-%C3%A5rsst%C3%A4mma-2026.pdf";
const SVOLDER_BOARD_URL = "https://svolder.se/bolagsstyrning/styrelse/";
const LATOUR_BOARD_URL = "https://www.latour.se/en/corporate-governance/the-board-of-directors";

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

const CREADES_2026_DIRECTORS: InvestmentCompanyDirectorGovernanceEvidence[] = [
  { name: "Sven Hagströmer", independentFromCompanyManagement: true, independentFromMajorShareholders: false },
  { name: "Cecilia Hermansson", independentFromCompanyManagement: true, independentFromMajorShareholders: true },
  { name: "Peter Nilsson", independentFromCompanyManagement: true, independentFromMajorShareholders: true },
  { name: "Maria Rankka", independentFromCompanyManagement: true, independentFromMajorShareholders: true },
  { name: "Anna Settman", independentFromCompanyManagement: true, independentFromMajorShareholders: true },
  { name: "Lars Stugemo", independentFromCompanyManagement: true, independentFromMajorShareholders: true },
  { name: "Hans Toll", independentFromCompanyManagement: true, independentFromMajorShareholders: true },
];

export type OfficialInvestmentCompanyGovernanceData = {
  directors: InvestmentCompanyDirectorGovernanceEvidence[];
  sources: AnalysisSource[];
  diagnostic: ProviderDiagnostic;
};

export type OfficialInvestmentCompanyGovernanceResult =
  | { ok: true; data: OfficialInvestmentCompanyGovernanceData }
  | { ok: false; reason: string; message: string; diagnostic: ProviderDiagnostic };

type VersionedRosterGovernanceRegistryEntry = {
  evidenceMode: "versioned-roster";
  id: "industrivarden" | "investor" | "creades";
  label: string;
  boardUrl: string;
  statementUrl: string;
  statementName: string;
  boardSourceName: string;
  directors: InvestmentCompanyDirectorGovernanceEvidence[];
  matches: (company: CompanySearchResult) => boolean;
  parseRoster: (html: string) => string[] | null;
};

type LivePageGovernanceRegistryEntry = {
  evidenceMode: "live-page";
  id: "svolder" | "latour";
  label: string;
  boardUrl: string;
  boardSourceName: string;
  evidenceUnavailableReason: string;
  evidenceUnavailableMessage: string;
  matches: (company: CompanySearchResult) => boolean;
  parseEvidence: (html: string) => InvestmentCompanyDirectorGovernanceEvidence[] | null;
};

type OfficialGovernanceRegistryEntry = VersionedRosterGovernanceRegistryEntry | LivePageGovernanceRegistryEntry;

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
    const name = match[1]
      .trim()
      .replace(/^Board\s+/u, "")
      .replace(/\s+/g, " ");
    const normalized = normalizeDirectorName(name);
    if (!seen.has(normalized)) {
      names.push(name);
      seen.add(normalized);
    }
  }

  return names.length > 0 ? names : null;
}

export function parseInvestorOfficialBoardRoster(html: string): string[] | null {
  const names: string[] = [];
  const seen = new Set<string>();
  const directorLinkPattern = /<a\b[^>]*href=["'][^"']*\/about-investor\/board-management\/board-of-directors\/[^"'?#/]+[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;

  while ((match = directorLinkPattern.exec(html)) !== null) {
    const heading = match[1].match(/<h[1-4]\b[^>]*>([\s\S]*?)<\/h[1-4]>/i);
    if (!heading) continue;
    const name = htmlToText(heading[1]);
    if (!name) continue;
    const normalized = normalizeDirectorName(name);
    if (!seen.has(normalized)) {
      names.push(name);
      seen.add(normalized);
    }
  }

  return names.length > 0 ? names : null;
}

function parseSwedishBoardCount(text: string): number | null {
  const match = text.match(/bestå(?:r)?\s+av\s+(\d+|en|ett|två|tre|fyra|fem|sex|sju|åtta|nio|tio)\s+ledamöter/i);
  if (!match) return null;
  const token = match[1].toLocaleLowerCase("sv-SE");
  if (/^\d+$/.test(token)) return Number(token);
  const counts: Record<string, number> = {
    en: 1,
    ett: 1,
    två: 2,
    tre: 3,
    fyra: 4,
    fem: 5,
    sex: 6,
    sju: 7,
    åtta: 8,
    nio: 9,
    tio: 10,
  };
  return counts[token] ?? null;
}
export function parseCreadesOfficialBoardRoster(html: string): string[] | null {
  const text = htmlToText(html);
  const expectedCount = parseSwedishBoardCount(text);
  if (!expectedCount || expectedCount < 1) return null;

  const membersMatch = text.match(
    /Till\s+styrelseledamöter\s+omvaldes\s+(.+?)\.\s*([\p{Lu}][\p{L}\p{M}.'’\-]+(?:\s+[\p{Lu}][\p{L}\p{M}.'’\-]+){1,4})\s+omvaldes\s+till\s+styrelseordförande\./iu,
  );
  if (!membersMatch) return null;

  const chair = membersMatch[2].trim().replace(/\s+/g, " ");
  const members = membersMatch[1]
    .split(/\s*,\s*|\s+och\s+/i)
    .map((name) => name.trim().replace(/\s+/g, " "))
    .filter(Boolean);
  const names = [chair, ...members];
  const normalizedNames = names.map(normalizeDirectorName);

  if (names.length !== expectedCount) return null;
  if (new Set(normalizedNames).size !== names.length) return null;
  return names;
}

export function parseSvolderOfficialGovernanceEvidence(
  html: string,
): InvestmentCompanyDirectorGovernanceEvidence[] | null {
  const decodedHtml = decodeHtml(html);
  const text = htmlToText(decodedHtml);
  const expectedCount = parseSwedishBoardCount(text);
  if (!expectedCount || expectedCount < 1) return null;

  const boardHeading = /<h[1-4]\b[^>]*>\s*Styrelse\s*<\/h[1-4]>/i.exec(decodedHtml);
  if (!boardHeading || boardHeading.index === undefined) return null;
  const afterBoardHeading = decodedHtml.slice(boardHeading.index + boardHeading[0].length);
  const independenceHeading = /<h[1-4]\b[^>]*>\s*Beroendeförhållanden\s*<\/h[1-4]>/i.exec(afterBoardHeading);
  if (!independenceHeading || independenceHeading.index === undefined) return null;

  const boardHtml = afterBoardHeading.slice(0, independenceHeading.index);
  const names: string[] = [];
  const seen = new Set<string>();
  const headingPattern = /<h[1-4]\b[^>]*>([\s\S]*?)<\/h[1-4]>([\s\S]*?)(?=<h[1-4]\b|$)/gi;
  let headingMatch: RegExpExecArray | null;
  while ((headingMatch = headingPattern.exec(boardHtml)) !== null) {
    const name = htmlToText(headingMatch[1]);
    const followingText = htmlToText(headingMatch[2]);
    if (!name || !/\b(?:styrelsens\s+ordförande|styrelseledamot)\b/i.test(followingText)) continue;
    const normalized = normalizeDirectorName(name);
    if (seen.has(normalized)) return null;
    names.push(name);
    seen.add(normalized);
  }

  if (names.length !== expectedCount || seen.size !== expectedCount) return null;

  const independenceText = htmlToText(afterBoardHeading.slice(independenceHeading.index));
  if (!/styrelsens\s+ledamöter\s+är\s+samtliga\s+oberoende\s+i\s+förhållande\s+till\s+bolaget\s+och\s+bolagsledningen/i.test(independenceText)) {
    return null;
  }

  const dependentMatch = independenceText.match(
    /av\s+dessa\s+ledamöter\s+är\s+(.+?)\s+beroende\s+i\s+förhållande\s+till\s+svolders\s+största\s+aktieägare/i,
  );
  if (!dependentMatch) return null;
  const dependentName = dependentMatch[1].trim().replace(/\s+/g, " ");
  const dependentNormalized = normalizeDirectorName(dependentName);
  if (!seen.has(dependentNormalized)) return null;

  return names.map((name) => ({
    name,
    independentFromCompanyManagement: true,
    independentFromMajorShareholders: normalizeDirectorName(name) !== dependentNormalized,
  }));
}

export function parseLatourOfficialGovernanceEvidence(
  html: string,
): InvestmentCompanyDirectorGovernanceEvidence[] | null {
  const decodedHtml = decodeHtml(html);
  const text = htmlToText(decodedHtml);
  const boardCountMatch = text.match(
    /Board of Latour consists of\s+(eight|8)\s+regular members,\s+includ(?:ing|ig)\s+the CEO/i,
  );
  if (!boardCountMatch) return null;
  const expectedCount = 8;

  if (!/With\s+(?:the\s+)?exception of the CEO,\s+no member holds any assignments in the Group/i.test(text)) {
    return null;
  }

  const dependentMatch = text.match(
    /Two of the members are not independent of the company's largest owner,\s*([^.]+)\./i,
  );
  if (!dependentMatch) return null;
  const dependentNames = dependentMatch[1]
    .split(/\s+and\s+/i)
    .map((name) => name.trim().replace(/\s+/g, " "))
    .filter(Boolean);
  if (dependentNames.length !== 2) return null;
  const dependentNormalized = new Set(dependentNames.map(normalizeDirectorName));
  if (dependentNormalized.size !== 2) return null;

  const directors = new Map<string, { name: string; isCeo: boolean }>();
  const headingPattern = /<h[1-4]\b[^>]*>([\s\S]*?)<\/h[1-4]>([\s\S]*?)(?=<h[1-4]\b|$)/gi;
  let headingMatch: RegExpExecArray | null;
  while ((headingMatch = headingPattern.exec(decodedHtml)) !== null) {
    const name = htmlToText(headingMatch[1]);
    const followingText = htmlToText(headingMatch[2]);
    if (!name || !/\bBorn:\s*(?:19|20)\d{2}\b/i.test(followingText)) continue;
    const roleMatch = followingText.match(/\b(Board member and CEO|Chairman of the Board|Board member)\b/i);
    if (!roleMatch || !/\bIndependent:\s*(?:Yes|No)\b/i.test(followingText)) continue;

    const normalized = normalizeDirectorName(name);
    const isCeo = /Board member and CEO/i.test(roleMatch[1]);
    const existing = directors.get(normalized);
    if (existing) {
      if (existing.isCeo !== isCeo) return null;
      continue;
    }
    directors.set(normalized, { name, isCeo });
  }

  if (directors.size !== expectedCount) return null;
  const ceos = [...directors.entries()].filter(([, director]) => director.isCeo);
  if (ceos.length !== 1) return null;
  const ceoNormalized = ceos[0][0];
  if (![...dependentNormalized].every((name) => directors.has(name))) return null;

  return [...directors.entries()].map(([normalized, director]) => ({
    name: director.name,
    independentFromCompanyManagement: normalized !== ceoNormalized,
    independentFromMajorShareholders: !dependentNormalized.has(normalized),
  }));
}

const REGISTRY: OfficialGovernanceRegistryEntry[] = [
  {
    evidenceMode: "versioned-roster",
    id: "industrivarden",
    label: "Industrivärden",
    boardUrl: INDUSTRIVARDEN_BOARD_URL,
    statementUrl: INDUSTRIVARDEN_INDEPENDENCE_STATEMENT_URL,
    statementName: "Industrivärden 2026 Nominating Committee independence statement",
    boardSourceName: "Industrivärden current Board of Directors",
    directors: INDUSTRIVARDEN_2026_DIRECTORS,
    matches: (company) => {
      const identity = normalizeIdentity(company);
      return /\bindu(?:-[ac])?\.st\b/.test(identity)
        || identity.includes("industrivärden")
        || identity.includes("industrivarden");
    },
    parseRoster: parseIndustrivardenOfficialBoardRoster,
  },
  {
    evidenceMode: "versioned-roster",
    id: "investor",
    label: "Investor",
    boardUrl: INVESTOR_BOARD_URL,
    statementUrl: INVESTOR_INDEPENDENCE_STATEMENT_URL,
    statementName: "Investor AB 2026 Nomination Committee board independence information",
    boardSourceName: "Investor AB current Board of Directors",
    directors: INVESTOR_2026_DIRECTORS,
    matches: (company) => {
      const identity = normalizeIdentity(company);
      return /\binve(?:-[ab])?\.st\b/.test(identity)
        || identity.includes("investor ab");
    },
    parseRoster: parseInvestorOfficialBoardRoster,
  },
  {
    evidenceMode: "versioned-roster",
    id: "creades",
    label: "Creades",
    boardUrl: CREADES_BOARD_URL,
    statementUrl: CREADES_INDEPENDENCE_STATEMENT_URL,
    statementName: "Creades 2026 Nomination Committee board independence information",
    boardSourceName: "Creades current Board of Directors",
    directors: CREADES_2026_DIRECTORS,
    matches: (company) => {
      const identity = normalizeIdentity(company);
      return /\bcred(?:-[ab])?\.st\b/.test(identity)
        || identity.includes("creades");
    },
    parseRoster: parseCreadesOfficialBoardRoster,
  },
  {
    evidenceMode: "live-page",
    id: "svolder",
    label: "Svolder",
    boardUrl: SVOLDER_BOARD_URL,
    boardSourceName: "Svolder current Board of Directors and independence relationships",
    evidenceUnavailableReason: "svolder_governance_independence_evidence_unavailable",
    evidenceUnavailableMessage: "The current official Svolder page does not contain a complete board roster plus explicit independence evidence that can be verified safely.",
    matches: (company) => {
      const identity = normalizeIdentity(company);
      return /\bsvol(?:-[ab])?\.st\b/.test(identity)
        || identity.includes("svolder");
    },
    parseEvidence: parseSvolderOfficialGovernanceEvidence,
  },
  {
    evidenceMode: "live-page",
    id: "latour",
    label: "Latour",
    boardUrl: LATOUR_BOARD_URL,
    boardSourceName: "Latour current Board of Directors and independence relationships",
    evidenceUnavailableReason: "latour_governance_independence_evidence_unavailable",
    evidenceUnavailableMessage: "The current official Latour page does not contain a complete board roster plus explicit management and major-owner independence evidence that can be verified safely.",
    matches: (company) => {
      const identity = normalizeIdentity(company);
      return /\blato(?:-[ab])?\.st\b/.test(identity)
        || identity.includes("investment ab latour")
        || identity.includes("latour");
    },
    parseEvidence: parseLatourOfficialGovernanceEvidence,
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

    const html = await response.text();
    const accessedAt = new Date().toISOString();

    if (entry.evidenceMode === "live-page") {
      const directors = entry.parseEvidence(html);
      if (!directors) {
        return failure(
          entry.evidenceUnavailableReason,
          entry.evidenceUnavailableMessage,
        );
      }

      return {
        ok: true,
        data: {
          directors,
          sources: [
            {
              name: entry.boardSourceName,
              url: entry.boardUrl,
              accessedAt,
              freshness: "Live official board roster and explicit independence relationships fetched together at analysis time with cache disabled; incomplete or changed evidence fails closed.",
              provider: PROVIDER_ID,
              version: PROVIDER_VERSION,
              capability: "specialized",
            },
          ],
          diagnostic: diagnostic("available"),
        },
      };
    }

    const currentRoster = entry.parseRoster(html);
    if (!currentRoster) {
      return failure(
        `${entry.id}_current_board_roster_unavailable`,
        `The current official ${entry.label} board roster could not be parsed completely enough to revalidate governance evidence.`,
      );
    }

    if (!rosterMatchesVerifiedEvidence(currentRoster, entry.directors)) {
      return failure(
        `${entry.id}_current_board_roster_mismatch`,
        `The current official ${entry.label} board roster differs from the board covered by the verified 2026 independence evidence.`,
      );
    }

    const sources: AnalysisSource[] = [
      {
        name: entry.statementName,
        url: entry.statementUrl,
        accessedAt,
        freshness: "Versioned official 2026 independence evidence. It is used only while a live fetch of the official board page confirms the complete director roster still matches exactly.",
        provider: PROVIDER_ID,
        version: PROVIDER_VERSION,
        capability: "specialized",
      },
      {
        name: entry.boardSourceName,
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