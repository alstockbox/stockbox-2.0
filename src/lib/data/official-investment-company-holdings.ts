import type { AnalysisSource, CompanySearchResult, ProviderDiagnostic } from "@/lib/analysis/types";

const REQUEST_TIMEOUT_MS = 10_000;
const PROVIDER_ID = "official-investment-company-holdings";
const PROVIDER_VERSION = "v1";
const MIN_REPRESENTED_WEIGHT = 0.95;
const MAX_ROUNDING_WEIGHT_SUM = 1.05;
const SVOLDER_RECONCILIATION_TOLERANCE = 0.005;

export type OfficialInvestmentCompanyHolding = {
  name: string;
  weight: number;
  reportedWeight: number;
  issuerFundamentalsEligible?: boolean;
};

export type ParsedOfficialInvestmentCompanyHoldings = {
  holdings: OfficialInvestmentCompanyHolding[];
  rawWeightSum: number;
  asOf: string;
};

export type OfficialInvestmentCompanyHoldingsData = ParsedOfficialInvestmentCompanyHoldings & {
  source: AnalysisSource;
  diagnostic: ProviderDiagnostic;
};

export type OfficialInvestmentCompanyHoldingsResult =
  | { ok: true; data: OfficialInvestmentCompanyHoldingsData }
  | { ok: false; reason: string; message: string; diagnostic: ProviderDiagnostic };

type OfficialHoldingsRegistryEntry = {
  id: "industrivarden" | "svolder" | "lundbergs";
  url: string;
  sourceName: string;
  matches: (company: CompanySearchResult) => boolean;
  parse: (html: string) => ParsedOfficialInvestmentCompanyHoldings | null;
};

function diagnostic(status: ProviderDiagnostic["status"], reason?: string): ProviderDiagnostic {
  return {
    provider: "Official investment-company holdings",
    capability: "specialized",
    status,
    reason,
    observedAt: new Date().toISOString(),
  };
}

function normalizeIdentity(company: CompanySearchResult): string {
  return `${company.canonicalTicker ?? company.ticker} ${company.ticker} ${company.name}`.toLowerCase();
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

function parsePercentage(value: string): number | null {
  const text = htmlToText(value).replace(/\u00a0/g, " ").trim();
  const match = /^(-?\d+(?:[.,]\d+)?)\s*%$/.exec(text);
  if (!match) return null;
  const percentage = Number.parseFloat(match[1].replace(",", "."));
  if (!Number.isFinite(percentage) || percentage <= 0 || percentage > 100) return null;
  return percentage / 100;
}

function parseSwedishNumber(value: string): number | null {
  const normalized = value.replace(/\s/g, "").replace(",", ".");
  if (!normalized) return null;
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

const MONTHS: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

function isoDate(year: number, month: number, day: number): string | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  const timestamp = Date.UTC(year, month - 1, day);
  const date = new Date(timestamp);
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
    || timestamp > Date.now()
  ) {
    return null;
  }
  return date.toISOString().slice(0, 10);
}

function parseEnglishDate(text: string): string | null {
  const match = /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s*(20\d{2})\b/i.exec(text);
  if (!match) return null;
  const month = MONTHS[match[1].toLowerCase()];
  return month ? isoDate(Number(match[3]), month, Number(match[2])) : null;
}

function parseRows(html: string): Array<{ name: string; reportedWeight: number }> {
  const rows: Array<{ name: string; reportedWeight: number }> = [];
  const rowPattern = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowPattern.exec(html)) !== null) {
    const cells: string[] = [];
    const cellPattern = /<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi;
    let cellMatch: RegExpExecArray | null;
    while ((cellMatch = cellPattern.exec(rowMatch[1])) !== null) {
      cells.push(cellMatch[1]);
    }
    if (cells.length < 2) continue;

    const weightedCells = cells.flatMap((cell, index) => {
      const weight = parsePercentage(cell);
      return weight === null ? [] : [{ index, weight }];
    });
    if (weightedCells.length !== 1) continue;

    const { index: weightIndex, weight } = weightedCells[0];
    const nameCandidates = cells
      .filter((_, index) => index !== weightIndex)
      .map(htmlToText)
      .filter((value) => value.length >= 2 && !/^total$/i.test(value) && !/^summa$/i.test(value));
    const name = nameCandidates.find((value) => /[A-Za-zÅÄÖåäö]/.test(value));
    if (!name) continue;
    rows.push({ name, reportedWeight: weight });
  }
  return rows;
}

export function parseIndustrivardenOfficialHoldings(
  html: string,
): ParsedOfficialInvestmentCompanyHoldings | null {
  const asOf = parseEnglishDate(htmlToText(html));
  if (!asOf) return null;

  const parsedRows = parseRows(html);
  const deduped = new Map<string, { name: string; reportedWeight: number }>();
  for (const row of parsedRows) {
    const key = row.name.toLocaleLowerCase("sv-SE");
    if (deduped.has(key)) return null;
    deduped.set(key, row);
  }
  const rows = [...deduped.values()];
  if (rows.length < 2) return null;

  const rawWeightSum = rows.reduce((sum, holding) => sum + holding.reportedWeight, 0);
  if (
    !Number.isFinite(rawWeightSum)
    || rawWeightSum < MIN_REPRESENTED_WEIGHT
    || rawWeightSum > MAX_ROUNDING_WEIGHT_SUM
  ) {
    return null;
  }

  return {
    holdings: rows.map((holding) => ({
      name: holding.name,
      reportedWeight: holding.reportedWeight,
      weight: holding.reportedWeight / rawWeightSum,
    })),
    rawWeightSum,
    asOf,
  };
}

type SvolderEquityHolding = {
  name: string;
  marketValue: number;
  reportedWeight: number;
};

function parseSvolderEquityHeadings(html: string): SvolderEquityHolding[] {
  const headings = [...html.matchAll(/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/gi)];
  const holdings: SvolderEquityHolding[] = [];

  for (let index = 0; index < headings.length; index += 1) {
    const heading = headings[index];
    const name = htmlToText(heading[1]);
    if (!name || /^(?:aktieportföljen|svolder ab)/i.test(name)) continue;

    const blockStart = (heading.index ?? 0) + heading[0].length;
    const blockEnd = index + 1 < headings.length ? (headings[index + 1].index ?? html.length) : html.length;
    const blockText = htmlToText(html.slice(blockStart, blockEnd));
    const values = /^(\d[\d\s]*[.,]\d{2})\s+(\d[\d\s]*)\s+(\d{1,3}(?:[.,]\d+)?)\b/.exec(blockText);
    if (!values) continue;

    const marketValue = parseSwedishNumber(values[2]);
    const weightPercent = parseSwedishNumber(values[3]);
    if (
      marketValue === null
      || marketValue <= 0
      || weightPercent === null
      || weightPercent <= 0
      || weightPercent > 100
    ) {
      return [];
    }

    holdings.push({
      name,
      marketValue,
      reportedWeight: weightPercent / 100,
    });
  }

  return holdings;
}

export function parseSvolderOfficialHoldings(
  html: string,
): ParsedOfficialInvestmentCompanyHoldings | null {
  const text = htmlToText(html);
  const dateMatch = /\bSvolders? innehav per\s+(20\d{2})-(\d{2})-(\d{2})\b/i.exec(text);
  const asOf = dateMatch
    ? isoDate(Number(dateMatch[1]), Number(dateMatch[2]), Number(dateMatch[3]))
    : null;
  if (!asOf) return null;

  const summary = /Aktieportföljen\s+([\d\s]+)\s+(\d+(?:[.,]\d+)?)\s+Nettofordran\(\+\)\/nettoskuld\(-\)\s+(-?[\d\s]+)\s+(-?\d+(?:[.,]\d+)?)\s+Totalt\/Substansvärde\s+([\d\s]+)\s+(\d+(?:[.,]\d+)?)/i.exec(text);
  if (!summary) return null;

  const equityMarketValue = parseSwedishNumber(summary[1]);
  const equityWeightPercent = parseSwedishNumber(summary[2]);
  const netReceivableValue = parseSwedishNumber(summary[3]);
  const netReceivableWeightPercent = parseSwedishNumber(summary[4]);
  const totalMarketValue = parseSwedishNumber(summary[5]);
  const totalWeightPercent = parseSwedishNumber(summary[6]);
  if (
    equityMarketValue === null
    || equityMarketValue <= 0
    || equityWeightPercent === null
    || equityWeightPercent <= 0
    || netReceivableValue === null
    || netReceivableValue <= 0
    || netReceivableWeightPercent === null
    || netReceivableWeightPercent <= 0
    || totalMarketValue === null
    || totalMarketValue <= 0
    || totalWeightPercent === null
    || totalWeightPercent <= 0
  ) {
    return null;
  }

  const equityWeight = equityWeightPercent / 100;
  const netReceivableWeight = netReceivableWeightPercent / 100;
  const publishedTotalWeight = totalWeightPercent / 100;
  if (
    Math.abs(publishedTotalWeight - 1) > SVOLDER_RECONCILIATION_TOLERANCE
    || Math.abs((equityWeight + netReceivableWeight) - publishedTotalWeight) > SVOLDER_RECONCILIATION_TOLERANCE
    || Math.abs((equityMarketValue + netReceivableValue) - totalMarketValue) > Math.max(2, totalMarketValue * 0.002)
  ) {
    return null;
  }

  const equities = parseSvolderEquityHeadings(html);
  if (equities.length < 5) return null;
  const uniqueNames = new Set(equities.map((holding) => holding.name.toLocaleLowerCase("sv-SE")));
  if (uniqueNames.size !== equities.length) return null;

  const representedEquityWeight = equities.reduce((sum, holding) => sum + holding.reportedWeight, 0);
  const representedEquityValue = equities.reduce((sum, holding) => sum + holding.marketValue, 0);
  if (
    Math.abs(representedEquityWeight - equityWeight) > SVOLDER_RECONCILIATION_TOLERANCE
    || Math.abs(representedEquityValue - equityMarketValue) > Math.max(2, equityMarketValue * 0.002)
  ) {
    return null;
  }

  const rows = [
    ...equities.map(({ name, reportedWeight }) => ({
      name,
      reportedWeight,
      issuerFundamentalsEligible: true,
    })),
    {
      name: "Net receivable / cash",
      reportedWeight: netReceivableWeight,
      issuerFundamentalsEligible: false,
    },
  ];
  const rawWeightSum = rows.reduce((sum, holding) => sum + holding.reportedWeight, 0);
  if (
    rawWeightSum < MIN_REPRESENTED_WEIGHT
    || rawWeightSum > MAX_ROUNDING_WEIGHT_SUM
    || Math.abs(rawWeightSum - publishedTotalWeight) > SVOLDER_RECONCILIATION_TOLERANCE
  ) {
    return null;
  }

  return {
    holdings: rows.map((holding) => ({
      ...holding,
      weight: holding.reportedWeight / rawWeightSum,
    })),
    rawWeightSum,
    asOf,
  };
}

const LUNDBERGS_ALLOCATION_START = "Lundbergs investerar i fastigheter och börsnoterade företag.";
const LUNDBERGS_ALLOCATION_END = "De börsnoterade innehaven är värderade till marknadsvärde.";
const LUNDBERGS_NON_ISSUER_EXPOSURES = new Set(["lundbergs fastigheter", "övriga värdepapper"]);

function parseLundbergsAllocationRows(html: string): Array<{ name: string; reportedWeight: number }> {
  const text = htmlToText(html);
  const lowerText = text.toLocaleLowerCase("sv-SE");
  const startMarker = LUNDBERGS_ALLOCATION_START.toLocaleLowerCase("sv-SE");
  const endMarker = LUNDBERGS_ALLOCATION_END.toLocaleLowerCase("sv-SE");
  const markerIndex = lowerText.indexOf(startMarker);
  if (markerIndex < 0) return [];

  const allocationStart = markerIndex + LUNDBERGS_ALLOCATION_START.length;
  const allocationEnd = lowerText.indexOf(endMarker, allocationStart);
  if (allocationEnd <= allocationStart) return [];

  const allocationText = text.slice(allocationStart, allocationEnd).trim();
  const rows: Array<{ name: string; reportedWeight: number }> = [];
  const itemPattern = /(.+?)\s+(-?\d+(?:[.,]\d+)?)\s*%(?=\s|$)/g;
  let itemMatch: RegExpExecArray | null;

  while ((itemMatch = itemPattern.exec(allocationText)) !== null) {
    const name = itemMatch[1].trim().replace(/\s+/g, " ");
    const percentage = Number.parseFloat(itemMatch[2].replace(",", "."));
    if (!name || !/[A-Za-zÅÄÖåäö]/.test(name) || !Number.isFinite(percentage) || percentage <= 0 || percentage > 100) {
      return [];
    }
    rows.push({ name, reportedWeight: percentage / 100 });
  }

  return rows;
}

export function parseLundbergsOfficialHoldings(
  html: string,
): ParsedOfficialInvestmentCompanyHoldings | null {
  const text = htmlToText(html);
  const navIndex = text.toLocaleLowerCase("sv-SE").lastIndexOf("substansvärde");
  if (navIndex < 0) return null;
  const dateMatch = /\b(20\d{2})-(\d{2})-(\d{2})\b/.exec(text.slice(navIndex, navIndex + 160));
  const asOf = dateMatch
    ? isoDate(Number(dateMatch[1]), Number(dateMatch[2]), Number(dateMatch[3]))
    : null;
  if (!asOf) return null;

  const rows = parseLundbergsAllocationRows(html);
  if (rows.length < 5) return null;
  const uniqueNames = new Set(rows.map((holding) => holding.name.toLocaleLowerCase("sv-SE")));
  if (uniqueNames.size !== rows.length) return null;

  const rawWeightSum = rows.reduce((sum, holding) => sum + holding.reportedWeight, 0);
  if (
    !Number.isFinite(rawWeightSum)
    || rawWeightSum < MIN_REPRESENTED_WEIGHT
    || rawWeightSum > MAX_ROUNDING_WEIGHT_SUM
  ) {
    return null;
  }

  return {
    holdings: rows.map((holding) => ({
      ...holding,
      weight: holding.reportedWeight / rawWeightSum,
      issuerFundamentalsEligible: !LUNDBERGS_NON_ISSUER_EXPOSURES.has(
        holding.name.trim().toLocaleLowerCase("sv-SE"),
      ),
    })),
    rawWeightSum,
    asOf,
  };
}

const REGISTRY: OfficialHoldingsRegistryEntry[] = [
  {
    id: "industrivarden",
    url: "https://www.industrivarden.se/en-gb/operations/portfolio/ownership-and-development/",
    sourceName: "Industrivärden official portfolio",
    matches: (company) => {
      const identity = normalizeIdentity(company);
      return /\bindu(?:-[ac])?\.st\b/.test(identity) || identity.includes("industrivärden") || identity.includes("industrivarden");
    },
    parse: parseIndustrivardenOfficialHoldings,
  },
  {
    id: "svolder",
    url: "https://svolder.se/om-svolder/innehav/",
    sourceName: "Svolder official portfolio",
    matches: (company) => {
      const identity = normalizeIdentity(company);
      return /\bsvol(?:-[ab])?\.st\b/.test(identity) || identity.includes("svolder");
    },
    parse: parseSvolderOfficialHoldings,
  },
  {
    id: "lundbergs",
    url: "https://www.lundbergforetagen.se/sv",
    sourceName: "Lundbergs official portfolio",
    matches: (company) => {
      const identity = normalizeIdentity(company);
      return /\blund(?:-[ab])?\.st\b/.test(identity)
        || identity.includes("lundbergföretagen")
        || identity.includes("lundbergforetagen");
    },
    parse: parseLundbergsOfficialHoldings,
  },
];

function failure(reason: string, message: string): OfficialInvestmentCompanyHoldingsResult {
  return {
    ok: false,
    reason,
    message,
    diagnostic: diagnostic("unavailable", reason),
  };
}

export async function fetchOfficialInvestmentCompanyHoldings(
  company: CompanySearchResult,
): Promise<OfficialInvestmentCompanyHoldingsResult> {
  const entry = REGISTRY.find((candidate) => candidate.matches(company));
  if (!entry) {
    return failure(
      "official_holdings_adapter_not_configured",
      "No verified official holdings adapter is configured for this investment company.",
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(entry.url, {
      headers: { accept: "text/html,application/xhtml+xml" },
      signal: controller.signal,
      next: { revalidate: 60 * 60 },
    });
    if (!response.ok) {
      return failure(response.status === 429 ? "rate_limited" : `http_${response.status}`, "Official holdings page could not be fetched.");
    }
    const parsed = entry.parse(await response.text());
    if (!parsed) {
      return failure(
        "official_holdings_incomplete_or_unparseable",
        "Official holdings were unavailable, incomplete below the 95% representation threshold, failed issuer-specific reconciliation, or were outside the allowed rounding tolerance.",
      );
    }

    const accessedAt = new Date().toISOString();
    const source: AnalysisSource = {
      name: entry.sourceName,
      url: entry.url,
      accessedAt,
      freshness: "Official portfolio weights published by the investment company; rounded published weights are normalized only when total representation remains within 95–105% and issuer-specific reconciliation checks pass.",
      provider: PROVIDER_ID,
      version: PROVIDER_VERSION,
      capability: "specialized",
      dataAsOf: parsed.asOf,
    };
    return {
      ok: true,
      data: {
        ...parsed,
        source,
        diagnostic: diagnostic("available"),
      },
    };
  } catch (error) {
    return failure(
      error instanceof Error && error.name === "AbortError" ? "timeout" : "upstream_error",
      "Official holdings provider failed before verified holdings could be parsed.",
    );
  } finally {
    clearTimeout(timeout);
  }
}
