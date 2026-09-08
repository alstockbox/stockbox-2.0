import type { AnalysisSource, CompanySearchResult, ProviderDiagnostic } from "@/lib/analysis/types";

const REQUEST_TIMEOUT_MS = 10_000;
const PROVIDER_ID = "official-investment-company-leverage";
const PROVIDER_VERSION = "official-investment-company-leverage-v1";
const LATOUR_AS_OF = "2026-06-30";
const LATOUR_H1_2026_URL = "https://news.cision.com/investment-ab-latour/r/interim-report-january---june-2026%2Cc4384935";

export type ParsedOfficialInvestmentCompanyLeverage = {
  ratio: number;
  netDebtExcludingIfrs16: number;
};

export type OfficialInvestmentCompanyLeverageData = ParsedOfficialInvestmentCompanyLeverage & {
  asOf: string;
  source: AnalysisSource;
  diagnostic: ProviderDiagnostic;
};

export type OfficialInvestmentCompanyLeverageResult =
  | { ok: true; data: OfficialInvestmentCompanyLeverageData }
  | { ok: false; reason: string; message: string; diagnostic: ProviderDiagnostic };

type OfficialLeverageRegistryEntry = {
  id: "latour";
  url: string;
  asOf: string;
  matches: (company: CompanySearchResult) => boolean;
  parse: (html: string) => ParsedOfficialInvestmentCompanyLeverage | null;
};

function diagnostic(status: ProviderDiagnostic["status"], reason?: string): ProviderDiagnostic {
  return {
    provider: "Official investment-company leverage",
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

function parseEnglishThousands(value: string): number | null {
  const normalized = value.replace(/[ ,]/g, "");
  if (!/^\d+$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseLatourOfficialLeverageDisclosure(
  html: string,
): ParsedOfficialInvestmentCompanyLeverage | null {
  const text = htmlToText(html);
  const pattern = /net debt,\s*excluding lease liabilities recognised under IFRS 16,\s*was SEK\s+([\d ,]+)\s*m\s*\([\d ,]+\s*m\)\s*and is equivalent to\s+(\d+(?:\.\d+)?)\s*\([^)]*\)\s*per cent of the market value of total assets/gi;
  const matches = [...text.matchAll(pattern)];
  if (matches.length !== 1) return null;

  const netDebtMillions = parseEnglishThousands(matches[0][1] ?? "");
  const ratioPercent = Number(matches[0][2]);
  if (
    netDebtMillions === null
    || netDebtMillions <= 0
    || !Number.isFinite(ratioPercent)
    || ratioPercent < 0
    || ratioPercent >= 100
  ) {
    return null;
  }

  const ratio = Number((ratioPercent / 100).toFixed(6));
  if (!Number.isFinite(ratio) || ratio < 0 || ratio >= 1) return null;

  return {
    ratio,
    netDebtExcludingIfrs16: netDebtMillions * 1_000_000,
  };
}

const REGISTRY: OfficialLeverageRegistryEntry[] = [
  {
    id: "latour",
    url: LATOUR_H1_2026_URL,
    asOf: LATOUR_AS_OF,
    matches: (company) => {
      const identity = normalizeIdentity(company);
      return /\blato(?:-[ab])?\.st\b/.test(identity)
        || identity.includes("investment ab latour");
    },
    parse: parseLatourOfficialLeverageDisclosure,
  },
];

function failure(reason: string, message: string): OfficialInvestmentCompanyLeverageResult {
  return {
    ok: false,
    reason,
    message,
    diagnostic: diagnostic("unavailable", reason),
  };
}

export async function fetchOfficialInvestmentCompanyLeverage(
  company: CompanySearchResult,
): Promise<OfficialInvestmentCompanyLeverageResult> {
  const entry = REGISTRY.find((candidate) => candidate.matches(company));
  if (!entry) {
    return failure(
      "official_leverage_adapter_not_configured",
      "No verified official current-leverage adapter is configured for this investment company.",
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(entry.url, {
      headers: { accept: "text/html,application/xhtml+xml" },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) {
      return failure(
        response.status === 429 ? "rate_limited" : `http_${response.status}`,
        "Official investment-company leverage disclosure could not be fetched.",
      );
    }

    const parsed = entry.parse(await response.text());
    if (!parsed) {
      return failure(
        "official_leverage_incomplete_or_unparseable",
        "Official leverage disclosure did not contain one unambiguous issuer-defined current ratio for net debt excluding IFRS 16 relative to the market value of total assets.",
      );
    }

    const accessedAt = new Date().toISOString();
    const source: AnalysisSource = {
      name: "Latour H1 2026 issuer leverage disclosure",
      url: entry.url,
      accessedAt,
      freshness: "Issuer-published leverage ratio for net debt excluding IFRS 16 relative to the market value of total assets; the published ratio is consumed directly without debt/NAV algebra.",
      provider: PROVIDER_ID,
      version: PROVIDER_VERSION,
      capability: "specialized",
      dataAsOf: entry.asOf,
    };

    return {
      ok: true,
      data: {
        ...parsed,
        asOf: entry.asOf,
        source,
        diagnostic: diagnostic("available"),
      },
    };
  } catch (error) {
    return failure(
      error instanceof Error && error.name === "AbortError" ? "timeout" : "upstream_error",
      "Official investment-company leverage provider failed before verified current leverage evidence could be parsed.",
    );
  } finally {
    clearTimeout(timeout);
  }
}
