import type { AnalysisSource, CompanySearchResult, ProviderDiagnostic } from "@/lib/analysis/types";

const REQUEST_TIMEOUT_MS = 10_000;
const PROVIDER_ID = "official-investment-company-key-ratios";
const PROVIDER_VERSION = "official-investment-company-key-ratios-v1";
const MIN_COMPLETE_YEARS = 5;
const MAX_ANNUAL_LEVERAGE_YEAR_LAG = 1;
const INDUSTRIVARDEN_URL = "https://www.industrivarden.se/en-gb/investors/industrivarden-in-figures/key-ratios/";

export type InvestmentCompanyKeyRatioYear = {
  year: number;
  debtEquitiesRatio: number;
};

export type ParsedOfficialInvestmentCompanyKeyRatios = {
  years: InvestmentCompanyKeyRatioYear[];
};

export type OfficialInvestmentCompanyKeyRatiosData = ParsedOfficialInvestmentCompanyKeyRatios & {
  source: AnalysisSource;
  diagnostic: ProviderDiagnostic;
};

export type OfficialInvestmentCompanyKeyRatiosResult =
  | { ok: true; data: OfficialInvestmentCompanyKeyRatiosData }
  | { ok: false; reason: string; message: string; diagnostic: ProviderDiagnostic };

function diagnostic(status: ProviderDiagnostic["status"], reason?: string): ProviderDiagnostic {
  return {
    provider: "Official investment-company key ratios",
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

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&ndash;|&#8211;/gi, "–")
    .replace(/&minus;|&#8722;/gi, "−");
}

function htmlToText(value: string): string {
  return decodeHtml(value)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseRows(html: string): string[][] {
  const rows: string[][] = [];
  const rowPattern = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowPattern.exec(html)) !== null) {
    const cells: string[] = [];
    const cellPattern = /<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi;
    let cellMatch: RegExpExecArray | null;
    while ((cellMatch = cellPattern.exec(rowMatch[1])) !== null) {
      cells.push(htmlToText(cellMatch[1]));
    }
    if (cells.length) rows.push(cells);
  }
  return rows;
}

function parsePercent(value: string): number | null {
  const normalized = value.replace(/\u00a0/g, " ").replace(/−/g, "-").trim();
  if (!/^[+-]?\d+(?:\.\d+)?$/.test(normalized)) return null;
  const percent = Number(normalized);
  if (!Number.isFinite(percent) || percent < 0 || percent >= 100) return null;
  return Number((percent / 100).toFixed(8));
}

export function parseIndustrivardenOfficialKeyRatios(
  html: string,
): ParsedOfficialInvestmentCompanyKeyRatios | null {
  const rows = parseRows(html);
  const yearRow = rows.find((cells) => {
    const nonEmpty = cells.filter(Boolean);
    return nonEmpty.length >= MIN_COMPLETE_YEARS && nonEmpty.every((cell) => /^20\d{2}$/.test(cell));
  });
  if (!yearRow) return null;

  const years = yearRow.filter(Boolean).map(Number);
  if (new Set(years).size !== years.length) return null;
  if (!years.every((year, index) => index === 0 || year < years[index - 1])) return null;

  const debtRatioRow = rows.find((cells) => {
    const label = (cells[0] ?? "").toLocaleLowerCase("en-US").replace(/[–—]/g, "-");
    return label.includes("debt-equities ratio");
  });
  if (!debtRatioRow || debtRatioRow.slice(1).length !== years.length) return null;

  const ratios = debtRatioRow.slice(1).map(parsePercent);
  if (ratios.some((value) => value === null)) return null;

  return {
    years: years.map((year, index) => ({
      year,
      debtEquitiesRatio: ratios[index] as number,
    })),
  };
}

export function selectVerifiedAnnualLeverageRatio(
  years: Array<{ year: number; debtEquitiesRatio: number }> | null | undefined,
  marketYear: number | undefined,
): number | null {
  if (!Number.isInteger(marketYear)) return null;

  const candidate = [...(years ?? [])]
    .filter((point) => Number.isInteger(point.year) && point.year <= (marketYear as number))
    .sort((left, right) => right.year - left.year)[0];
  if (!candidate) return null;

  const lag = (marketYear as number) - candidate.year;
  if (lag < 0 || lag > MAX_ANNUAL_LEVERAGE_YEAR_LAG) return null;

  const ratio = candidate.debtEquitiesRatio;
  return Number.isFinite(ratio) && ratio >= 0 && ratio < 1 ? ratio : null;
}

function failure(reason: string, message: string): OfficialInvestmentCompanyKeyRatiosResult {
  return {
    ok: false,
    reason,
    message,
    diagnostic: diagnostic("unavailable", reason),
  };
}

export async function fetchOfficialInvestmentCompanyKeyRatios(
  company: CompanySearchResult,
): Promise<OfficialInvestmentCompanyKeyRatiosResult> {
  const identity = normalizeIdentity(company);
  const isIndustrivarden = /\bindu(?:-[ac])?\.st\b/.test(identity)
    || identity.includes("industrivärden")
    || identity.includes("industrivarden");
  if (!isIndustrivarden) {
    return failure(
      "official_key_ratios_adapter_not_configured",
      "No verified official annual leverage adapter is configured for this investment company.",
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(INDUSTRIVARDEN_URL, {
      headers: { accept: "text/html,application/xhtml+xml" },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) {
      return failure(
        response.status === 429 ? "rate_limited" : `http_${response.status}`,
        "Official Industrivärden key-ratio page could not be fetched.",
      );
    }

    const parsed = parseIndustrivardenOfficialKeyRatios(await response.text());
    if (!parsed) {
      return failure(
        "official_key_ratios_incomplete_or_unparseable",
        "Official Industrivärden key-ratio history did not contain at least five aligned annual debt-equities ratios.",
      );
    }

    const accessedAt = new Date().toISOString();
    const latestYear = parsed.years[0]?.year ?? null;
    const source: AnalysisSource = {
      name: "Industrivärden official key ratios",
      url: INDUSTRIVARDEN_URL,
      accessedAt,
      freshness: "Issuer-published annual debt-equities ratio history; percentages are consumed directly and are not reconstructed from consolidated debt or NAV.",
      provider: PROVIDER_ID,
      version: PROVIDER_VERSION,
      capability: "specialized",
      dataAsOf: latestYear ? `${latestYear}-12-31` : null,
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
      "Official Industrivärden key-ratio provider failed before verified annual leverage evidence could be parsed.",
    );
  } finally {
    clearTimeout(timeout);
  }
}
