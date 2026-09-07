import type { AnalysisSource, CompanySearchResult, ProviderDiagnostic } from "@/lib/analysis/types";
import type { AnnualNavPerShareObservation, NavPerShareObservation } from "./investment-company-nav-history";

const REQUEST_TIMEOUT_MS = 10_000;
const PROVIDER_ID = "official-investment-company-nav";

export type OfficialInvestmentCompanyNavData = {
  reportedNav: number | null;
  reportedNavPerShare: number | null;
  navAsOf: string | null;
  navPerShareHistory: NavPerShareObservation[];
  annualNavPerShareHistory: AnnualNavPerShareObservation[];
  historySource: AnalysisSource | null;
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

type OfficialNavFetchResult = {
  parsed: ParsedNav | null;
  url: string;
  navPerShareHistory: NavPerShareObservation[];
  annualNavPerShareHistory: AnnualNavPerShareObservation[];
  historyUrl: string | null;
};

type OfficialNavRegistryEntry = {
  id: "investor" | "latour" | "industrivarden" | "svolder" | "creades" | "lundbergs";
  matches: (company: CompanySearchResult) => boolean;
  fetch: () => Promise<OfficialNavFetchResult>;
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

function tableContainingRow(html: string, labelPattern: RegExp): string | null {
  const tables = html.match(/<table\b[^>]*>[\s\S]*?<\/table>/gi) ?? [];
  return tables.find((table) => tableRow(table, labelPattern) !== null) ?? null;
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

function fiscalYearEnd(label: string): number | null {
  const match = /^(\d{2}|\d{4})\/(\d{2}|\d{4})$/.exec(label.trim());
  if (!match) return null;

  const startRaw = Number.parseInt(match[1], 10);
  const endRaw = Number.parseInt(match[2], 10);
  let startYear = match[1].length === 4 ? startRaw : 2000 + startRaw;
  let endYear: number;

  if (match[2].length === 4) {
    endYear = endRaw;
    if (match[1].length === 2) {
      const century = Math.floor(endYear / 100) * 100;
      startYear = century + startRaw;
      if (startYear > endYear) startYear -= 100;
    }
  } else if (match[1].length === 4) {
    const century = Math.floor(startYear / 100) * 100;
    endYear = century + endRaw;
    if (endYear < startYear) endYear += 100;
  } else {
    endYear = 2000 + endRaw;
  }

  if (startYear < 2000 || endYear > 2200 || endYear !== startYear + 1) return null;
  return endYear;
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

export function parseLatourOfficialNavHistory(html: string): NavPerShareObservation[] {
  const labelPattern = /^Substansvärde per aktie,?\s*kr/i;
  const table = tableContainingRow(html, labelPattern);
  if (!table) return [];

  const perShareValues = rowNumbers(tableRow(table, labelPattern));
  const cells = table.match(/<t[dh]\b[^>]*>[\s\S]*?<\/t[dh]>/gi) ?? [];
  const quarters = cells.flatMap((cell) => {
    const match = /^Q([1-4])\/(\d{2}|\d{4})$/i.exec(htmlToText(cell));
    if (!match) return [];
    const quarter = Number.parseInt(match[1], 10);
    const rawYear = Number.parseInt(match[2], 10);
    const year = rawYear < 100 ? 2000 + rawYear : rawYear;
    const date = quarterEnd(quarter, year);
    return date ? [{ date }] : [];
  });

  if (quarters.length === 0 || quarters.length !== perShareValues.length) return [];
  if (perShareValues.some((value) => !Number.isFinite(value) || value <= 0)) return [];

  const dates = quarters.map((quarter) => quarter.date);
  if (new Set(dates).size !== dates.length) return [];

  return quarters.map((quarter, index) => ({
    date: quarter.date,
    navPerShare: perShareValues[index],
  }));
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

export function parseSvolderOfficialNav(html: string): ParsedNav | null {
  const text = htmlToText(html);
  const match = text.match(/Svolders? substansvärde\s+(\d{4}-\d{2}-\d{2})\s*:\s*([\d\s.,]+)\s*SEK per aktie/i)
    ?? text.match(/Substansvärde\s+(\d{4}-\d{2}-\d{2})\s*[:\-]?\s*([\d\s.,]+)\s*SEK\s*(?:per aktie)?/i);
  if (!match) return null;
  const perShare = parseSwedishTableNumber(match[2]);
  if (perShare === null || perShare <= 0) return null;
  return { reportedNav: null, reportedNavPerShare: perShare, navAsOf: match[1] };
}

export function parseSvolderOfficialAnnualNavHistory(html: string): AnnualNavPerShareObservation[] {
  const labelPattern = /^Substansvärde,?\s*SEK\b/i;
  const table = tableContainingRow(html, labelPattern);
  if (!table) return [];

  const navRow = tableRow(table, labelPattern);
  if (!navRow) return [];
  const navCells = (navRow.match(/<t[dh]\b[^>]*>[\s\S]*?<\/t[dh]>/gi) ?? []).map(htmlToText);
  if (navCells.length < 2 || !labelPattern.test(navCells[0])) return [];
  const navValues = navCells.slice(1).map(parseSwedishTableNumber);
  if (navValues.some((value) => value === null || !Number.isFinite(value) || value <= 0)) return [];

  const rows = table.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) ?? [];
  const headerYears = rows.flatMap((row) => {
    const cells = (row.match(/<t[dh]\b[^>]*>[\s\S]*?<\/t[dh]>/gi) ?? []).map(htmlToText);
    const years = cells.flatMap((cell) => {
      const year = fiscalYearEnd(cell);
      return year === null ? [] : [year];
    });
    return years.length === navValues.length ? [years] : [];
  })[0] ?? [];

  if (headerYears.length === 0 || headerYears.length !== navValues.length) return [];
  if (new Set(headerYears).size !== headerYears.length) return [];
  if (!headerYears.every((year, index) => index === 0 || year === headerYears[index - 1] - 1)) return [];

  return headerYears.map((year, index) => ({
    year,
    navPerShare: navValues[index] as number,
  }));
}

export function parseCreadesOfficialNav(html: string): ParsedNav | null {
  const text = htmlToText(html);
  const dated = text.match(/Substansvärde per\s+(\d{4}-\d{2}-\d{2})/i);
  const perShareMatch = text.match(/substansvärde[^.]{0,180}?uppgår till\s+([\d\s.,]+)\s+kronor per aktie/i)
    ?? text.match(/substansvärde per aktie[^\d]{0,30}([\d\s.,]+)/i);
  const perShare = perShareMatch ? parseSwedishTableNumber(perShareMatch[1]) : null;
  if (perShare === null || perShare <= 0) return null;

  const totalValues = rowNumbers(tableRow(html, /^Totalt\b/i));
  const totalMsek = totalValues.find((value) => value > 1_000) ?? null;
  return {
    reportedNav: totalMsek !== null ? totalMsek * 1_000_000 : null,
    reportedNavPerShare: perShare,
    navAsOf: dated?.[1] ?? null,
  };
}

export function parseCreadesOfficialAnnualNavObservation(html: string): AnnualNavPerShareObservation | null {
  const text = htmlToText(html);
  const matches = [...text.matchAll(
    /\b31\s+december\s+((?:19|20)\d{2})\s+uppgick\s+substansvärdet\s+till\s+([\d\s.,]+)\s+kronor\s+per\s+aktie\b/gi,
  )];
  if (matches.length !== 1) return null;

  const year = Number.parseInt(matches[0][1], 10);
  const navPerShare = parseSwedishTableNumber(matches[0][2]);
  if (!Number.isFinite(year) || year < 2000 || year > 2200 || navPerShare === null || navPerShare <= 0) return null;
  return { year, navPerShare };
}

export function parseLundbergsOfficialNav(html: string): ParsedNav | null {
  const text = htmlToText(html);
  const match = text.match(/Substansvärde\s+([\d\s.,]+)\s*Mdkr\s+(\d{4}-\d{2}-\d{2})/i)
    ?? text.match(/substansvärdet[^.]{0,120}?([\d\s.,]+)\s*mdkr[^.]{0,80}?(\d{4}-\d{2}-\d{2})/i);
  if (!match) return null;
  const totalBn = parseSwedishTableNumber(match[1]);
  if (totalBn === null || totalBn <= 0) return null;
  return { reportedNav: totalBn * 1_000_000_000, reportedNavPerShare: null, navAsOf: match[2] };
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

function emptyHistoryFields(): Pick<OfficialNavFetchResult, "annualNavPerShareHistory" | "historyUrl"> {
  return { annualNavPerShareHistory: [], historyUrl: null };
}

async function investorFetcher(): Promise<OfficialNavFetchResult> {
  const year = new Date().getUTCFullYear();
  const url = `https://www.investorab.com/investors-media/reports-presentations/${year}`;
  const html = await fetchText(url);
  return {
    parsed: html ? parseInvestorOfficialNav(html) : null,
    url,
    navPerShareHistory: [],
    ...emptyHistoryFields(),
  };
}

async function latourFetcher(): Promise<OfficialNavFetchResult> {
  const url = "https://www.latour.se/sv/investerare/substansvarde";
  const html = await fetchText(url);
  return {
    parsed: html ? parseLatourOfficialNav(html) : null,
    url,
    navPerShareHistory: html ? parseLatourOfficialNavHistory(html) : [],
    ...emptyHistoryFields(),
  };
}

function absoluteIndustrivardenUrl(href: string): string {
  try {
    return new URL(href, "https://www.industrivarden.se").toString();
  } catch {
    return "https://www.industrivarden.se/en-gb/";
  }
}

async function industrivardenFetcher(): Promise<OfficialNavFetchResult> {
  const releasesUrl = "https://www.industrivarden.se/en-gb/media/press-releases/";
  const releasesHtml = await fetchText(releasesUrl);
  if (releasesHtml) {
    const hrefs = [...releasesHtml.matchAll(/href=["']([^"']*net-asset-value-on-[^"'#?]+)["']/gi)]
      .map((match) => absoluteIndustrivardenUrl(match[1]));
    for (const url of [...new Set(hrefs)].slice(0, 4)) {
      const html = await fetchText(url);
      const parsed = html ? parseIndustrivardenOfficialNav(html) : null;
      if (parsed) return { parsed, url, navPerShareHistory: [], ...emptyHistoryFields() };
    }
  }

  const fallbackUrl = "https://www.industrivarden.se/en-gb/";
  const fallbackHtml = await fetchText(fallbackUrl);
  return {
    parsed: fallbackHtml ? parseIndustrivardenOfficialNav(fallbackHtml) : null,
    url: fallbackUrl,
    navPerShareHistory: [],
    ...emptyHistoryFields(),
  };
}

async function svolderFetcher(): Promise<OfficialNavFetchResult> {
  const url = "https://svolder.se/pressreleaser/";
  const historyUrl = "https://svolder.se/investor-relations/svolderaktien/";
  const [html, historyHtml] = await Promise.all([fetchText(url), fetchText(historyUrl)]);
  const annualNavPerShareHistory = historyHtml ? parseSvolderOfficialAnnualNavHistory(historyHtml) : [];
  return {
    parsed: html ? parseSvolderOfficialNav(html) : null,
    url,
    navPerShareHistory: [],
    annualNavPerShareHistory,
    historyUrl: annualNavPerShareHistory.length > 0 ? historyUrl : null,
  };
}

async function creadesFetcher(): Promise<OfficialNavFetchResult> {
  const url = "https://www.creades.se/innehav/substansvarde/";
  const historyUrl = "https://www.creades.se/pressmeddelanden/pressmeddelanden/2025/creades-substansvarde-1-januari-30-november-2025/";
  const [html, historyHtml] = await Promise.all([fetchText(url), fetchText(historyUrl)]);
  const currentAnnual = html ? parseCreadesOfficialAnnualNavObservation(html) : null;
  const priorAnnual = historyHtml ? parseCreadesOfficialAnnualNavObservation(historyHtml) : null;
  const annualNavPerShareHistory = currentAnnual && priorAnnual && currentAnnual.year === priorAnnual.year + 1
    ? [currentAnnual, priorAnnual]
    : [];
  return {
    parsed: html ? parseCreadesOfficialNav(html) : null,
    url,
    navPerShareHistory: [],
    annualNavPerShareHistory,
    historyUrl: annualNavPerShareHistory.length > 0 ? historyUrl : null,
  };
}

async function lundbergsFetcher(): Promise<OfficialNavFetchResult> {
  const url = "https://www.lundbergforetagen.se/sv";
  const html = await fetchText(url);
  return {
    parsed: html ? parseLundbergsOfficialNav(html) : null,
    url,
    navPerShareHistory: [],
    ...emptyHistoryFields(),
  };
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
  {
    id: "svolder",
    matches: (company) => /\bsvol[-_ ]?[ab]?\.st\b|\bsvolder\b/i.test(normalizeIdentity(company)),
    fetch: svolderFetcher,
  },
  {
    id: "creades",
    matches: (company) => /\bcred[-_ ]?[a]?\.st\b|\bcreades\b/i.test(normalizeIdentity(company)),
    fetch: creadesFetcher,
  },
  {
    id: "lundbergs",
    matches: (company) => /\blund[-_ ]?[ab]?\.st\b|lundbergf[oö]retagen|\blundbergs\b/i.test(normalizeIdentity(company)),
    fetch: lundbergsFetcher,
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

  const { parsed, url, navPerShareHistory, annualNavPerShareHistory, historyUrl } = await entry.fetch();
  if (!parsed || (parsed.reportedNav === null && parsed.reportedNavPerShare === null)) {
    return {
      ok: false,
      message: "The official investment-company source did not expose a NAV value that StockBox could verify.",
      diagnostic: diagnostic("unavailable", `${entry.id}_official_nav_parse_failed`),
    };
  }

  const accessedAt = new Date().toISOString();
  const historySource: AnalysisSource | null = historyUrl && annualNavPerShareHistory.length > 0
    ? {
      name: `${company.name} official annual NAV history`,
      url: historyUrl,
      accessedAt,
      freshness: "Annual NAV/share history is fetched directly from the investment company's official investor-relations disclosure at analysis time.",
      provider: PROVIDER_ID,
      capability: "specialized",
      dataAsOf: null,
      version: "official-investment-company-nav-annual-history-v1",
    }
    : null;

  return {
    ok: true,
    data: {
      ...parsed,
      navPerShareHistory,
      annualNavPerShareHistory,
      historySource,
      source: {
        name: `${company.name} official NAV disclosure`,
        url,
        accessedAt,
        freshness: "NAV is fetched directly from the investment company's official investor-relations disclosure at analysis time.",
        provider: PROVIDER_ID,
        capability: "specialized",
        dataAsOf: parsed.navAsOf,
        version: "official-investment-company-nav-v3",
      },
      diagnostic: diagnostic("available"),
    },
  };
}