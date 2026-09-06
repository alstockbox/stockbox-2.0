import type { AnalysisSource, CompanySearchResult, ProviderDiagnostic } from "@/lib/analysis/types";

const REQUEST_TIMEOUT_MS = 10_000;
const PROVIDER_ID = "official-investment-company-holdings";
const PROVIDER_VERSION = "v1";
const MIN_REPRESENTED_WEIGHT = 0.95;
const MAX_ROUNDING_WEIGHT_SUM = 1.05;

export type OfficialInvestmentCompanyHolding = {
  name: string;
  weight: number;
  reportedWeight: number;
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
  id: "industrivarden";
  url: string;
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

const REGISTRY: OfficialHoldingsRegistryEntry[] = [
  {
    id: "industrivarden",
    url: "https://www.industrivarden.se/en-gb/operations/portfolio/ownership-and-development/",
    matches: (company) => {
      const identity = normalizeIdentity(company);
      return /\bindu(?:-[ac])?\.st\b/.test(identity) || identity.includes("industrivärden") || identity.includes("industrivarden");
    },
    parse: parseIndustrivardenOfficialHoldings,
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
        "Official holdings were unavailable, incomplete below the 95% representation threshold, or outside the allowed rounding tolerance.",
      );
    }

    const accessedAt = new Date().toISOString();
    const source: AnalysisSource = {
      name: "Industrivärden official portfolio",
      url: entry.url,
      accessedAt,
      freshness: "Official portfolio weights published by the investment company; rounded published weights are normalized only when total representation remains within 95–105%.",
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
