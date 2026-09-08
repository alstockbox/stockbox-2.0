import type { AnalysisSource, CompanySearchResult, ProviderDiagnostic } from "@/lib/analysis/types";

const REQUEST_TIMEOUT_MS = 10_000;
const PROVIDER_ID = "official-investment-company-key-ratios";
const PROVIDER_VERSION = "official-investment-company-key-ratios-v3";
const MIN_COMPLETE_YEARS = 5;
const MAX_ANNUAL_LEVERAGE_YEAR_LAG = 1;
const INDUSTRIVARDEN_URL = "https://www.industrivarden.se/en-gb/investors/industrivarden-in-figures/key-ratios/";

export type InvestmentCompanyKeyRatioYear = {
  year: number;
  debtEquitiesRatio: number;
  portfolioReturn?: number | null;
  benchmarkReturnSixrx?: number | null;
  netPurchasesSales?: number | null;
  netDebt?: number | null;
  navPerShare?: number | null;
  sharesOutstanding?: number | null;
  dividendsPaid?: number | null;
  dividendPerShare?: number | null;
  dividendsReceived?: number | null;
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

type MetricKey = Exclude<keyof InvestmentCompanyKeyRatioYear, "year">;
type Scale = "ratio_percent" | "sek_mn" | "shares_thousands" | "plain";

type ParsedRow = { cells: string[]; section: string | null };

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
    .replace(/&minus;|&#8722;/gi, "−")
    .replace(/&aring;|&#229;/gi, "å")
    .replace(/&auml;|&#228;/gi, "ä")
    .replace(/&ouml;|&#246;/gi, "ö");
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

function normalizeLabel(value: string): string {
  return value
    .toLocaleLowerCase("en-US")
    .replace(/[’']/g, "")
    .replace(/[–—]/g, "-")
    .replace(/\s*\/\s*/g, "/")
    .replace(/[^a-z0-9%/åäö-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function rawRows(html: string): string[][] {
  const rows: string[][] = [];
  const rowPattern = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowPattern.exec(html)) !== null) {
    const cells: string[] = [];
    const cellPattern = /<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi;
    let cellMatch: RegExpExecArray | null;
    while ((cellMatch = cellPattern.exec(rowMatch[1])) !== null) cells.push(htmlToText(cellMatch[1]));
    if (cells.length) rows.push(cells);
  }
  return rows;
}

const SECTION_LABELS = [
  "equities portfolio",
  "net debt",
  "net asset value",
  "number of shares outstanding",
  "dividends paid",
  "other key ratios",
] as const;

function rowsWithSections(rows: string[][]): ParsedRow[] {
  let section: string | null = null;
  return rows.map((cells) => {
    const meaningful = cells.filter(Boolean);
    if (meaningful.length === 1) {
      const label = normalizeLabel(meaningful[0]);
      const found = SECTION_LABELS.find((candidate) => label === candidate || label.startsWith(`${candidate} `));
      if (found) section = found;
    }
    return { cells, section };
  });
}

function parseEnglishNumber(value: string): number | null {
  const text = value.replace(/\u00a0/g, " ").replace(/−/g, "-").trim();
  if (!text || /^(?:n\/?a|na|not available|–|—|-)$/i.test(text)) return null;
  let normalized = text;
  if (/^[+-]?\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(normalized)) normalized = normalized.replace(/,/g, "");
  else if (/^[+-]?\d{1,3}(?: \d{3})+(?:\.\d+)?$/.test(normalized)) normalized = normalized.replace(/ /g, "");
  else if (!/^[+-]?\d+(?:\.\d+)?$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function scaled(value: string, scale: Scale): number | null {
  const parsed = parseEnglishNumber(value);
  if (parsed === null) return null;
  if (scale === "ratio_percent") return Number((parsed / 100).toFixed(8));
  if (scale === "sek_mn") return parsed * 1_000_000;
  if (scale === "shares_thousands") return parsed * 1_000;
  return parsed;
}

function findMetric(
  rows: ParsedRow[],
  years: number[],
  predicate: (label: string, section: string | null) => boolean,
  scale: Scale,
): Array<number | null> | null {
  const matches = rows.filter(({ cells, section }) => predicate(normalizeLabel(cells[0] ?? ""), section));
  if (matches.length !== 1) return null;
  const annual = matches[0].cells.slice(1);
  if (annual.length !== years.length) return null;
  return annual.map((value) => scaled(value, scale));
}

export function parseIndustrivardenOfficialKeyRatios(
  html: string,
): ParsedOfficialInvestmentCompanyKeyRatios | null {
  const raw = rawRows(html);
  const yearRow = raw.find((cells) => {
    const nonEmpty = cells.filter(Boolean);
    return nonEmpty.length >= MIN_COMPLETE_YEARS && nonEmpty.every((cell) => /^20\d{2}$/.test(cell));
  });
  if (!yearRow) return null;
  const years = yearRow.filter(Boolean).map(Number);
  if (new Set(years).size !== years.length) return null;
  if (!years.every((year, index) => index === 0 || year < years[index - 1])) return null;

  const rows = rowsWithSections(raw);
  const debtEquitiesRatio = findMetric(rows, years, (label) => label.includes("debt-equities ratio"), "ratio_percent");
  if (!debtEquitiesRatio || debtEquitiesRatio.some((value) => value === null || value < 0 || value >= 1)) return null;

  const portfolioReturn = findMetric(
    rows, years,
    (label, section) => section === "equities portfolio" && label.includes("total return") && !label.includes("index"),
    "ratio_percent",
  );
  const benchmarkReturnSixrx = findMetric(rows, years, (label) => label.includes("total return index") && label.includes("sixrx"), "ratio_percent");
  const netPurchasesSales = findMetric(rows, years, (label, section) => section === "equities portfolio" && label.includes("net purchases/sales"), "sek_mn");
  const netDebt = findMetric(rows, years, (label, section) => section === "net debt" && label.includes("value") && !label.includes("ratio"), "sek_mn");
  const navPerShare = findMetric(rows, years, (label, section) => section === "net asset value" && label.includes("per share"), "plain");
  const sharesOutstanding = findMetric(rows, years, (label, section) => section === "number of shares outstanding" && label.includes("total") && label.includes("thousands"), "shares_thousands");
  const dividendsPaid = findMetric(rows, years, (label, section) => section === "dividends paid" && label.includes("value") && !label.includes("per share"), "sek_mn");
  const dividendPerShare = findMetric(rows, years, (label, section) => section === "dividends paid" && label.includes("value per share"), "plain");
  const dividendsReceived = findMetric(rows, years, (label) => label.includes("dividends received"), "sek_mn");

  return {
    years: years.map((year, index) => ({
      year,
      debtEquitiesRatio: debtEquitiesRatio[index] as number,
      portfolioReturn: portfolioReturn?.[index] ?? null,
      benchmarkReturnSixrx: benchmarkReturnSixrx?.[index] ?? null,
      netPurchasesSales: netPurchasesSales?.[index] ?? null,
      netDebt: netDebt?.[index] ?? null,
      navPerShare: navPerShare?.[index] ?? null,
      sharesOutstanding: sharesOutstanding?.[index] ?? null,
      dividendsPaid: dividendsPaid?.[index] ?? null,
      dividendPerShare: dividendPerShare?.[index] ?? null,
      dividendsReceived: dividendsReceived?.[index] ?? null,
    })),
  };
}

export function selectVerifiedAnnualLeverageRatio(
  years: Array<{ year: number; debtEquitiesRatio: number }> | null | undefined,
  marketYear: number | undefined,
): number | null {
  if (!Number.isInteger(marketYear)) return null;
  const candidate = [...(years ?? [])]
    .filter((point) => Number.isInteger(point.year) && point.year < (marketYear as number))
    .sort((left, right) => right.year - left.year)[0];
  if (!candidate) return null;
  const lag = (marketYear as number) - candidate.year;
  if (lag < 0 || lag > MAX_ANNUAL_LEVERAGE_YEAR_LAG) return null;
  const ratio = candidate.debtEquitiesRatio;
  return Number.isFinite(ratio) && ratio >= 0 && ratio < 1 ? ratio : null;
}

function failure(reason: string, message: string): OfficialInvestmentCompanyKeyRatiosResult {
  return { ok: false, reason, message, diagnostic: diagnostic("unavailable", reason) };
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
      "No verified official annual key-ratio adapter is configured for this investment company.",
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
      freshness: "Issuer-published annual key-ratio history. Leverage is consumed directly; capital allocation and dividend quality are used only when each factor's required annual evidence is complete and internally reconcilable.",
      provider: PROVIDER_ID,
      version: PROVIDER_VERSION,
      capability: "specialized",
      dataAsOf: latestYear ? `${latestYear}-12-31` : null,
    };

    return {
      ok: true,
      data: { ...parsed, source, diagnostic: diagnostic("available") },
    };
  } catch (error) {
    return failure(
      error instanceof Error && error.name === "AbortError" ? "timeout" : "upstream_error",
      "Official Industrivärden key-ratio provider failed before verified annual evidence could be parsed.",
    );
  } finally {
    clearTimeout(timeout);
  }
}
