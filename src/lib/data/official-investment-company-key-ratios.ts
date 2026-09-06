import type { AnalysisSource, CompanySearchResult, ProviderDiagnostic } from "@/lib/analysis/types";

const REQUEST_TIMEOUT_MS = 10_000;
const PROVIDER_ID = "official-investment-company-key-ratios";
const PROVIDER_VERSION = "v2";
const MIN_COMPLETE_YEARS = 5;

export type InvestmentCompanyKeyRatioYear = {
  year: number;
  portfolioReturn: number;
  benchmarkReturnSixrx?: number | null;
  netPurchasesSales: number;
  netDebt: number;
  debtEquitiesRatio: number;
  navPerShare: number;
  sharesOutstanding: number;
  dividendsPaid: number;
  dividendPerShare: number;
  dividendsReceived: number;
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

type OfficialKeyRatiosRegistryEntry = {
  id: "industrivarden";
  url: string;
  matches: (company: CompanySearchResult) => boolean;
  parse: (html: string) => ParsedOfficialInvestmentCompanyKeyRatios | null;
};

type ParsedRow = {
  cells: string[];
};

type MetricKey = keyof Omit<InvestmentCompanyKeyRatioYear, "year">;

type MetricSpec = {
  key: MetricKey;
  matches: (label: string) => boolean;
  scale: "ratio_percent" | "sek_mn" | "shares_thousands" | "plain";
};

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
  return `${company.canonicalTicker ?? company.ticker} ${company.ticker} ${company.name}`.toLowerCase();
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

function parseRows(html: string): ParsedRow[] {
  const rows: ParsedRow[] = [];
  const rowPattern = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowPattern.exec(html)) !== null) {
    const cells: string[] = [];
    const cellPattern = /<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi;
    let cellMatch: RegExpExecArray | null;
    while ((cellMatch = cellPattern.exec(rowMatch[1])) !== null) {
      cells.push(htmlToText(cellMatch[1]));
    }
    if (cells.length) rows.push({ cells });
  }
  return rows;
}

function findYears(rows: ParsedRow[]): number[] | null {
  for (const row of rows) {
    const nonEmpty = row.cells.filter(Boolean);
    const yearCells = nonEmpty.filter((cell) => /^20\d{2}$/.test(cell));
    if (yearCells.length < MIN_COMPLETE_YEARS || yearCells.length !== nonEmpty.length) continue;
    const years = yearCells.map(Number);
    if (new Set(years).size !== years.length) return null;
    if (!years.every((year, index) => index === 0 || year < years[index - 1])) return null;
    return years;
  }
  return null;
}

const SECTION_LABELS = [
  "equities portfolio",
  "net debt",
  "net asset value",
  "number of shares outstanding",
  "dividends paid",
  "total return industrivärden shares",
  "other key ratios",
] as const;

function sectionForRow(cells: string[]): string | null {
  const meaningful = cells.filter(Boolean);
  if (meaningful.length !== 1) return null;
  const label = normalizeLabel(meaningful[0]);
  return SECTION_LABELS.find((section) => label === section || label.startsWith(`${section} `)) ?? null;
}

function metricLabel(section: string | null, rowLabel: string): string {
  const label = normalizeLabel(rowLabel);
  if (!section || label.includes(section)) return label;
  return `${section} ${label}`.trim();
}

const METRICS: MetricSpec[] = [
  {
    key: "portfolioReturn",
    matches: (label) => label.includes("equities portfolio") && label.includes("total return"),
    scale: "ratio_percent",
  },
  {
    key: "benchmarkReturnSixrx",
    matches: (label) => label.includes("total return index") && label.includes("sixrx"),
    scale: "ratio_percent",
  },
  {
    key: "netPurchasesSales",
    matches: (label) => label.includes("net purchases/sales") && (label.includes("equities portfolio") || label.startsWith("net purchases/sales")),
    scale: "sek_mn",
  },
  {
    key: "debtEquitiesRatio",
    matches: (label) => label.includes("debt-equities ratio") && (label.includes("net debt") || label.startsWith("debt-equities ratio")),
    scale: "ratio_percent",
  },
  {
    key: "netDebt",
    matches: (label) => label.includes("net debt") && label.includes("value") && !label.includes("debt-equities ratio"),
    scale: "sek_mn",
  },
  {
    key: "navPerShare",
    matches: (label) => label.includes("net asset value") && label.includes("per share"),
    scale: "plain",
  },
  {
    key: "sharesOutstanding",
    matches: (label) => label.includes("number of shares outstanding") && label.includes("total") && label.includes("thousands"),
    scale: "shares_thousands",
  },
  {
    key: "dividendPerShare",
    matches: (label) => label.includes("dividends paid") && label.includes("value per share"),
    scale: "plain",
  },
  {
    key: "dividendsPaid",
    matches: (label) => label.includes("dividends paid") && label.includes("value") && !label.includes("per share"),
    scale: "sek_mn",
  },
  {
    key: "dividendsReceived",
    matches: (label) => label.includes("dividends received"),
    scale: "sek_mn",
  },
];

function parseEnglishNumber(value: string): number | null {
  const text = value
    .replace(/\u00a0/g, " ")
    .replace(/−/g, "-")
    .trim();
  if (!text || /^(?:n\/?a|na|not available|–|—|-)$/i.test(text)) return null;

  let normalized = text;
  if (/^[+-]?\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(normalized)) {
    normalized = normalized.replace(/,/g, "");
  } else if (/^[+-]?\d{1,3}(?: \d{3})+(?:\.\d+)?$/.test(normalized)) {
    normalized = normalized.replace(/ /g, "");
  } else if (!/^[+-]?\d+(?:\.\d+)?$/.test(normalized)) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function scaleValue(value: number, scale: MetricSpec["scale"]): number {
  if (scale === "ratio_percent") return value / 100;
  if (scale === "sek_mn") return value * 1_000_000;
  if (scale === "shares_thousands") return value * 1_000;
  return value;
}

function parseMetricRows(rows: ParsedRow[], years: number[]): Map<MetricKey, number[]> | null {
  const values = new Map<MetricKey, number[]>();
  let section: string | null = null;

  for (const row of rows) {
    const detectedSection = sectionForRow(row.cells);
    if (detectedSection) {
      section = detectedSection;
      continue;
    }
    if (!row.cells.length) continue;

    const label = metricLabel(section, row.cells[0]);
    const spec = METRICS.find((candidate) => candidate.matches(label));
    if (!spec) continue;
    if (values.has(spec.key)) return null;

    const annualCells = row.cells.slice(1);
    if (annualCells.length !== years.length) return null;
    const parsed = annualCells.map(parseEnglishNumber);
    if (parsed.some((value) => value === null)) return null;
    values.set(spec.key, parsed.map((value) => scaleValue(value as number, spec.scale)));
  }

  if (METRICS.some((spec) => !values.has(spec.key))) return null;
  return values;
}

function yearIsValid(point: InvestmentCompanyKeyRatioYear): boolean {
  return Number.isInteger(point.year)
    && Number.isFinite(point.portfolioReturn)
    && Number.isFinite(point.benchmarkReturnSixrx)
    && Number.isFinite(point.netPurchasesSales)
    && Number.isFinite(point.netDebt)
    && Number.isFinite(point.debtEquitiesRatio)
    && point.debtEquitiesRatio >= 0
    && Number.isFinite(point.navPerShare)
    && point.navPerShare > 0
    && Number.isFinite(point.sharesOutstanding)
    && point.sharesOutstanding > 0
    && Number.isFinite(point.dividendsPaid)
    && point.dividendsPaid >= 0
    && Number.isFinite(point.dividendPerShare)
    && point.dividendPerShare >= 0
    && Number.isFinite(point.dividendsReceived)
    && point.dividendsReceived >= 0;
}

export function parseIndustrivardenOfficialKeyRatios(
  html: string,
): ParsedOfficialInvestmentCompanyKeyRatios | null {
  const rows = parseRows(html);
  const years = findYears(rows);
  if (!years) return null;

  const values = parseMetricRows(rows, years);
  if (!values) return null;

  const points = years.map((year, index): InvestmentCompanyKeyRatioYear => ({
    year,
    portfolioReturn: values.get("portfolioReturn")?.[index] ?? Number.NaN,
    benchmarkReturnSixrx: values.get("benchmarkReturnSixrx")?.[index] ?? Number.NaN,
    netPurchasesSales: values.get("netPurchasesSales")?.[index] ?? Number.NaN,
    netDebt: values.get("netDebt")?.[index] ?? Number.NaN,
    debtEquitiesRatio: values.get("debtEquitiesRatio")?.[index] ?? Number.NaN,
    navPerShare: values.get("navPerShare")?.[index] ?? Number.NaN,
    sharesOutstanding: values.get("sharesOutstanding")?.[index] ?? Number.NaN,
    dividendsPaid: values.get("dividendsPaid")?.[index] ?? Number.NaN,
    dividendPerShare: values.get("dividendPerShare")?.[index] ?? Number.NaN,
    dividendsReceived: values.get("dividendsReceived")?.[index] ?? Number.NaN,
  }));

  return points.length >= MIN_COMPLETE_YEARS && points.every(yearIsValid)
    ? { years: points }
    : null;
}

const REGISTRY: OfficialKeyRatiosRegistryEntry[] = [
  {
    id: "industrivarden",
    url: "https://www.industrivarden.se/en-gb/investors/industrivarden-in-figures/key-ratios/",
    matches: (company) => {
      const identity = normalizeIdentity(company);
      return /\bindu(?:-[ac])?\.st\b/.test(identity)
        || identity.includes("industrivärden")
        || identity.includes("industrivarden");
    },
    parse: parseIndustrivardenOfficialKeyRatios,
  },
];

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
  const entry = REGISTRY.find((candidate) => candidate.matches(company));
  if (!entry) {
    return failure(
      "official_key_ratios_adapter_not_configured",
      "No verified official key-ratio adapter is configured for this investment company.",
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
      return failure(
        response.status === 429 ? "rate_limited" : `http_${response.status}`,
        "Official investment-company key-ratio page could not be fetched.",
      );
    }

    const parsed = entry.parse(await response.text());
    if (!parsed) {
      return failure(
        "official_key_ratios_incomplete_or_unparseable",
        `Official key-ratio history did not contain at least ${MIN_COMPLETE_YEARS} fully aligned annual observations for every required metric.`,
      );
    }

    const accessedAt = new Date().toISOString();
    const latestYear = parsed.years[0]?.year ?? null;
    const source: AnalysisSource = {
      name: "Industrivärden official key ratios",
      url: entry.url,
      accessedAt,
      freshness: "Official annual key-ratio and SIXRX benchmark history; values retain the company's published annual alignment and are converted only for explicit units (percent, SEK million and thousands of shares).",
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
      "Official investment-company key-ratio provider failed before verified annual history could be parsed.",
    );
  } finally {
    clearTimeout(timeout);
  }
}