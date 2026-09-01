import type { AnalysisSource, CompanySearchResult, ProviderDiagnostic } from "@/lib/analysis/types";

const REQUEST_TIMEOUT_MS = 10_000;
const PROVIDER_ID = "official-investment-company-nav";

export type OfficialInvestmentCompanyNavData = {
  reportedNav: number | null;
  reportedNavPerShare: number | null;
  navAsOf: string | null;
  source: AnalysisSource;
  diagnostic: ProviderDiagnostic;
};

export type OfficialInvestmentCompanyNavResult =
  | { ok: true; data: OfficialInvestmentCompanyNavData }
  | { ok: false; message: string; diagnostic: ProviderDiagnostic };

type ParsedNav = {
  reportedNav: number | null;
  reportedNavPerShare: number | null;
  navAsOf: string | null;
};

type OfficialNavRegistryEntry = {
  id: "investor" | "latour" | "industrivarden";
  matches: (company: CompanySearchResult) => boolean;
  fetch: () => Promise<{ parsed: ParsedNav | null; url: string }>;
};

function diagnostic(status: ProviderDiagnostic["status"], reason?: string): ProviderDiagnostic {
  return {
    provider: "Official investment-company NAV",
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
    .replace(/&ndash;|&#8211;/gi, "-")
    .replace(/&mdash;|&#8212;/gi, "-");
}

function htmlToText(html: string): string {
  return decodeHtml(html)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseInternationalNumber(value: string): number | null {
  const normalized = value.replace(/\s/g, "").replace(/,/g, "");
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseSwedishTableNumber(value: string): number | null {
  const normalized = value.replace(/\s/g, "");
  if (!normalized) return null;
  if (/^-?\d{1,3}(?:,\d{3})+$/.test(normalized)) {
    const parsed = Number.parseInt(normalized.replace(/,/g, ""), 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  const decimalNormalized = normalized.replace(/\./g, "").replace(",", ".");
  const parsed = Number.parseFloat(decimalNormalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function isoDate(value: string): string | null {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  return new Date(timestamp).toISOString().slice(0, 10);
}

function quarterEnd(quarter: number, year: number): string | null {
  if (quarter < 1 || quarter > 4 || year < 2000 || year > 2200) return null;
  const monthDay: Record<number, string> = { 1: "03-31", 2: "06-30", 3: "09-30", 4: "12-31" };
  return `${year}-${monthDay[quarter]}`;
}

function tableRow(html: string, labelPattern: RegExp): string | null {
  const rows = html.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) ?? [];
  return rows.find((row) => labelPattern.test(htmlToText(row))) ?? null;
}

function rowNumbers(row: string | null): number[] {
  if (!row) return [];
  const cells = row.match(/<t[dh]\b[^>]*>[\s\S]*?<\/t[dh]>/gi) ?? [];
  return cells
    .map((cell) => htmlToText(cell))
    .flatMap((cell) => {
      const matches = cell.match(/-?\d[\d\s.,]*/g) ?? [];
      return matches.flatMap((match) => {
        const value = parseSwedishTableNumber(match.trim());
        return value === null ? [] : [value];
      });
    });
}

export function parseInvestorOfficialNav(html: string): ParsedNav | null {
  const text = htmlToText(html);
  const match = text.match(
    /Adjusted net asset value(?:\s*\(NAV\))? was SEK\s*([\d,.]+)\s*bn\s*\(SEK\s*([\d,.]+)\s*per share\)\s*on\s*([A-Za-z]+\s+\d{1,2},\s+\d{4})/i,
  );
  if (!match) return null;
  const totalBn = parseInternationalNumber(match[1]);
  const perShare = parseInternationalNumber(match[2]);
  if (totalBn === null || perShare === null || totalBn <= 0 || perShare <= 0) return null;
  return {
    reportedNav: totalBn * 1_000_000_000,
    reportedNavPerShare: perShare,
    navAsOf: isoDate(match[3]),
  };
}

export function parseLatourOfficialNav(html: string): ParsedNav | null {
  const totalValues = rowNumbers(tableRow(html, /^Substansvärde,?\s*Mkr/i));
  const perShareValues = rowNumbers(tableRow(html, /^Substansvärde per aktie,?\s*kr/i));
  const totalMsek = totalValues.at(-1) ?? null;
  const perShare = perShareValues.at(-1) ?? null;
  if (totalMsek === null || perShare === null || totalMsek <= 0 || perShare <= 0) return null;

  const text = htmlToText(html);
  const quarters = [...text.matchAll(/Q([1-4])\/(?:20)?(\d{2,4})/gi)];
  const latest = quarters.at(-1);
  const rawYear = latest ? Number.parseInt(latest[2], 10) : Number.NaN;
  const year = Number.isFinite(rawYear) ? (rawYear < 100 ? 2000 + rawYear : rawYear) : Number.NaN;
  const quarter = latest ? Number.parseInt(latest[1], 10) : Number.NaN;

  return {
    reportedNav: totalMsek * 1_000_000,
    reportedNavPerShare: perShare,
    navAsOf: Number.isFinite(year) && Number.isFinite(quarter) ? quarterEnd(quarter, year) : null,
  };
}

export function parseIndustrivardenOfficialNav(html: string): ParsedNav | null {
  const text = htmlToText(html);
  const pressRelease = text.match(
    /On\s+([A-Za-z]+\s+\d{1,2},\s+\d{4}),?\s+net asset value was SEK\s*([\d,.]+)\s*per share/i,
  );
  if (pressRelease) {
    const perShare = parseInternationalNumber(pressRelease[2]);
    if (perShare !== null && perShare > 0) {
      return { reportedNav: null, reportedNavPerShare: perShare, navAsOf: isoDate(pressRelease[1]) };
    }
  }

  const homepage = text.match(
    /Net asset value\s+SEK\s*([\d,.]+)\s+Per share on\s+([A-Za-z]+\s+\d{1,2},\s+\d{4})/i,
  );
  if (!homepage) return null;
  const perShare = parseInternationalNumber(homepage[1]);
  if (perShare === null || perShare <= 0) return null;
  return { reportedNav: null, reportedNavPerShare: perShare, navAsOf: isoDate(homepage[2]) };
}

async function fetchText(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "Mozilla/5.0 StockBox/2.0 (+https://www.getstockbox.app)",
      },
      cache: "no-store",
      signal: controller.signal,
    });
    return response.ok ? await response.text() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function investorFetcher(): Promise<{ parsed: ParsedNav | null; url: string }> {
  const year = new Date().getUTCFullYear();
  const url = `https://www.investorab.com/investors-media/reports-presentations/${year}`;
  const html = await fetchText(url);
  return { parsed: html ? parseInvestorOfficialNav(html) : null, url };
}

async function latourFetcher(): Promise<{ parsed: ParsedNav | null; url: string }> {
  const url = "https://www.latour.se/sv/investerare/substansvarde";
  const html = await fetchText(url);
  return { parsed: html ? parseLatourOfficialNav(html) : null, url };
}

function absoluteIndustrivardenUrl(href: string): string {
  try {
    return new URL(href, "https://www.industrivarden.se").toString();
  } catch {
    return "https://www.industrivarden.se/en-gb/";
  }
}

async function industrivardenFetcher(): Promise<{ parsed: ParsedNav | null; url: string }> {
  const releasesUrl = "https://www.industrivarden.se/en-gb/media/press-releases/";
  const releasesHtml = await fetchText(releasesUrl);
  if (releasesHtml) {
    const hrefs = [...releasesHtml.matchAll(/href=["']([^"']*net-asset-value-on-[^"'#?]+)["']/gi)]
      .map((match) => absoluteIndustrivardenUrl(match[1]));
    for (const url of [...new Set(hrefs)].slice(0, 4)) {
      const html = await fetchText(url);
      const parsed = html ? parseIndustrivardenOfficialNav(html) : null;
      if (parsed) return { parsed, url };
    }
  }

  const fallbackUrl = "https://www.industrivarden.se/en-gb/";
  const fallbackHtml = await fetchText(fallbackUrl);
  return { parsed: fallbackHtml ? parseIndustrivardenOfficialNav(fallbackHtml) : null, url: fallbackUrl };
}

const REGISTRY: OfficialNavRegistryEntry[] = [
  {
    id: "investor",
    matches: (company) => /\binve[-_ ]?[ab]?\.st\b|\binvestor ab\b/i.test(normalizeIdentity(company)),
    fetch: investorFetcher,
  },
  {
    id: "latour",
    matches: (company) => /\blato[-_ ]?b?\.st\b|\binvestment ab latour\b|\blatour\b/i.test(normalizeIdentity(company)),
    fetch: latourFetcher,
  },
  {
    id: "industrivarden",
    matches: (company) => /\bindu[-_ ]?[ac]?\.st\b|industriv[aä]rden/i.test(normalizeIdentity(company)),
    fetch: industrivardenFetcher,
  },
];

export async function fetchOfficialInvestmentCompanyNav(company: CompanySearchResult): Promise<OfficialInvestmentCompanyNavResult> {
  const entry = REGISTRY.find((candidate) => candidate.matches(company));
  if (!entry) {
    return {
      ok: false,
      message: "No verified official NAV adapter is configured for this investment company yet.",
      diagnostic: diagnostic("unavailable", "official_nav_adapter_not_configured"),
    };
  }

  const { parsed, url } = await entry.fetch();
  if (!parsed || (parsed.reportedNav === null && parsed.reportedNavPerShare === null)) {
    return {
      ok: false,
      message: "The official investment-company source did not expose a NAV value that StockBox could verify.",
      diagnostic: diagnostic("unavailable", `${entry.id}_official_nav_parse_failed`),
    };
  }

  const accessedAt = new Date().toISOString();
  return {
    ok: true,
    data: {
      ...parsed,
      source: {
        name: `${company.name} official NAV disclosure`,
        url,
        accessedAt,
        freshness: "NAV is fetched directly from the investment company's official investor-relations disclosure at analysis time.",
        provider: PROVIDER_ID,
        capability: "specialized",
        dataAsOf: parsed.navAsOf,
        version: "official-investment-company-nav-v1",
      },
      diagnostic: diagnostic("available"),
    },
  };
}
