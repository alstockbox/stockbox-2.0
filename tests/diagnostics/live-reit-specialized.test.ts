import { mkdir, writeFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { searchCompanies } from "../../src/lib/data/provider";
import { fetchYahooFundamentalsResult } from "../../src/lib/data/yahoo-fundamentals";

const liveDescribe = process.env.RUN_LIVE_COVERAGE === "1" ? describe : describe.skip;
const REIT_PROBE_TICKERS = ["ORC", "EQIX", "O", "PLD"] as const;
const STOCKBOX_CONTACT_USER_AGENT = "StockBox/1.0 https://www.getstockbox.app/contact";
const SEC_PROBE_TIMEOUT_MS = 12_000;
const MAX_EXHIBITS = 3;
const ARTIFACT_PATH = "artifacts/coverage-live/reit-specialized-fingerprint.json";
const SPECIALIZED_TERM = /\b(?:adjusted\s+funds\s+from\s+operations|funds\s+from\s+operations|normalized\s+funds\s+from\s+operations|core\s+funds\s+from\s+operations|AFFO|FFO|dividend|distribution|payout)\b/i;

type SecAccessProbe = {
  identity: string;
  endpoint: string;
  host: string;
  status: number | null;
  ok: boolean;
  error: string | null;
};

type RecentFilings = {
  accessionNumber?: unknown[];
  filingDate?: unknown[];
  form?: unknown[];
  items?: unknown[];
};

type SecSubmissionsPayload = {
  cik?: string;
  filings?: { recent?: RecentFilings };
};

type EarningsFiling = {
  cik: string;
  accession: string;
  filingDate: string;
};

type SecTextResult = {
  status: number | null;
  ok: boolean;
  text: string | null;
  error: string | null;
};

function padCik(value: string): string {
  return value.replace(/\D/g, "").padStart(10, "0");
}

function stringAt(values: unknown[] | undefined, index: number): string | null {
  const value = values?.[index];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function filingDirectory(filing: EarningsFiling): string {
  const numericCik = String(Number(filing.cik));
  return `https://www.sec.gov/Archives/edgar/data/${numericCik}/${filing.accession.replace(/-/g, "")}/`;
}

function filingIndexUrl(filing: EarningsFiling): string {
  return `${filingDirectory(filing)}${filing.accession}-index.htm`;
}

function latestEarnings8K(payload: SecSubmissionsPayload, requestedCik: string): EarningsFiling | null {
  const recent = payload.filings?.recent;
  const length = Math.max(
    recent?.accessionNumber?.length ?? 0,
    recent?.filingDate?.length ?? 0,
    recent?.form?.length ?? 0,
    recent?.items?.length ?? 0,
  );
  const candidates: EarningsFiling[] = [];
  for (let index = 0; index < length; index += 1) {
    if (stringAt(recent?.form, index) !== "8-K") continue;
    const items = stringAt(recent?.items, index)?.split(",").map((item) => item.trim()) ?? [];
    if (!items.includes("2.02")) continue;
    const accession = stringAt(recent?.accessionNumber, index);
    const filingDate = stringAt(recent?.filingDate, index);
    if (!accession || !filingDate || !/^\d{4}-\d{2}-\d{2}$/.test(filingDate)) continue;
    candidates.push({
      cik: padCik(payload.cik ?? requestedCik),
      accession,
      filingDate,
    });
  }
  return candidates.sort((left, right) => right.filingDate.localeCompare(left.filingDate))[0] ?? null;
}

function periodOfReport(indexHtml: string): string | null {
  return indexHtml.match(/Period\s+of\s+Report[\s\S]{0,320}?(\d{4}-\d{2}-\d{2})/i)?.[1] ?? null;
}

function secExhibitUrls(indexHtml: string, filing: EarningsFiling): string[] {
  const base = filingDirectory(filing);
  const urls = new Set<string>();
  for (const row of indexHtml.match(/<tr\b[\s\S]*?<\/tr>/gi) ?? []) {
    if (!/EX-99\.(?:1|2)\b/i.test(row)) continue;
    const href = row.match(/href\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!href) continue;
    try {
      const resolved = new URL(href, base);
      if (resolved.protocol !== "https:") continue;
      if (resolved.hostname !== "www.sec.gov" && resolved.hostname !== "sec.gov") continue;
      if (!resolved.pathname.startsWith(new URL(base).pathname)) continue;
      urls.add(resolved.toString());
    } catch {
      continue;
    }
    if (urls.size >= MAX_EXHIBITS) break;
  }
  return [...urls];
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&ndash;|&#8211;/gi, "-")
    .replace(/&mdash;|&#8212;/gi, "-")
    .replace(/&#36;/gi, "$")
    .replace(/&#(\d+);/g, (_match, code: string) => {
      const numeric = Number(code);
      return Number.isInteger(numeric) && numeric > 0 && numeric <= 0x10ffff
        ? String.fromCodePoint(numeric)
        : " ";
    });
}

function exhibitLines(html: string): string[] {
  const text = decodeHtmlEntities(html)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/td>/gi, " | ")
    .replace(/<\/(?:p|div|tr|li|h[1-6]|table|section)>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function compactSpecializedSnippets(html: string) {
  const lines = exhibitLines(html);
  const matches: Array<{ line: number; context: string }> = [];
  const seen = new Set<string>();
  for (let index = 0; index < lines.length; index += 1) {
    if (!SPECIALIZED_TERM.test(lines[index])) continue;
    const context = lines
      .slice(Math.max(0, index - 2), Math.min(lines.length, index + 3))
      .join(" || ")
      .slice(0, 1_600);
    if (seen.has(context)) continue;
    seen.add(context);
    matches.push({ line: index + 1, context });
    if (matches.length >= 40) break;
  }
  return matches;
}

async function fetchSecText(url: string, userAgent: string, accept: string): Promise<SecTextResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SEC_PROBE_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": userAgent,
        Accept: accept,
        "Accept-Encoding": "gzip, deflate",
      },
      signal: controller.signal,
      cache: "no-store",
    });
    return {
      status: response.status,
      ok: response.ok,
      text: response.ok ? await response.text() : null,
      error: response.ok ? null : `http_${response.status}`,
    };
  } catch (error) {
    return {
      status: null,
      ok: false,
      text: null,
      error: error instanceof Error ? `${error.name}:${error.message}` : "unknown_error",
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function probeSecEndpoint(input: {
  identity: string;
  userAgent: string;
  endpoint: string;
  url: string;
  accept: string;
}): Promise<SecAccessProbe> {
  const result = await fetchSecText(input.url, input.userAgent, input.accept);
  return {
    identity: input.identity,
    endpoint: input.endpoint,
    host: new URL(input.url).host,
    status: result.status,
    ok: result.ok,
    error: result.error,
  };
}

async function rawReitFilingFingerprint(ticker: string, cik: string, userAgent: string) {
  const paddedCik = padCik(cik);
  const submissionsUrl = `https://data.sec.gov/submissions/CIK${paddedCik}.json`;
  const submissions = await fetchSecText(submissionsUrl, userAgent, "application/json");
  if (!submissions.ok || !submissions.text) {
    return { ticker, cik: paddedCik, submissionsUrl, submissionsStatus: submissions.status, error: submissions.error };
  }

  let payload: SecSubmissionsPayload;
  try {
    payload = JSON.parse(submissions.text) as SecSubmissionsPayload;
  } catch {
    return { ticker, cik: paddedCik, submissionsUrl, submissionsStatus: submissions.status, error: "invalid_submissions_json" };
  }
  const filing = latestEarnings8K(payload, paddedCik);
  if (!filing) {
    return { ticker, cik: paddedCik, submissionsUrl, submissionsStatus: submissions.status, error: "no_item_2_02_8k" };
  }

  const indexUrl = filingIndexUrl(filing);
  const index = await fetchSecText(indexUrl, userAgent, "text/html,application/xhtml+xml");
  if (!index.ok || !index.text) {
    return {
      ticker,
      cik: paddedCik,
      submissionsUrl,
      filing,
      indexUrl,
      indexStatus: index.status,
      error: index.error,
    };
  }

  const reportPeriod = periodOfReport(index.text);
  const exhibitUrls = secExhibitUrls(index.text, filing);
  const exhibits = [] as Array<Record<string, unknown>>;
  for (const url of exhibitUrls) {
    const exhibit = await fetchSecText(url, userAgent, "text/html,application/xhtml+xml");
    exhibits.push({
      url,
      status: exhibit.status,
      ok: exhibit.ok,
      error: exhibit.error,
      matches: exhibit.text ? compactSpecializedSnippets(exhibit.text) : [],
    });
  }

  return {
    ticker,
    cik: paddedCik,
    submissionsUrl,
    submissionsStatus: submissions.status,
    filing,
    indexUrl,
    indexStatus: index.status,
    periodOfReport: reportPeriod,
    exhibitUrls,
    exhibits,
  };
}

liveDescribe("live REIT specialized enrichment diagnostic", () => {
  it("traces exact-listing identity, specialist output, and explicit FFO/AFFO evidence in current SEC earnings exhibits", async () => {
    const rows = [] as Array<Record<string, unknown>>;
    const resolvedCiks = new Map<string, string>();

    for (const ticker of REIT_PROBE_TICKERS) {
      const candidates = await searchCompanies(ticker);
      const company = candidates.find((candidate) =>
        (candidate.canonicalTicker ?? candidate.ticker).toUpperCase() === ticker
      );

      expect(company, `Expected an exact live search candidate for ${ticker}`).toBeTruthy();
      if (!company) continue;
      if (company.cik) resolvedCiks.set(ticker, company.cik);

      const result = await fetchYahooFundamentalsResult(company);
      rows.push({
        ticker,
        resolvedTicker: company.canonicalTicker ?? company.ticker,
        cik: company.cik ?? null,
        entityId: company.entityId ?? null,
        searchProviderIds: company.providerCapabilities?.providerIds ?? [],
        searchArchetypeHint: company.securityType ?? null,
        fundamentalsOk: result.ok,
        fundamentalsArchetype: result.ok ? result.data.analysisArchetype ?? null : null,
        specialistKind: result.ok ? result.data.specialized?.kind ?? null : null,
        specialistMetrics: result.ok && result.data.specialized?.kind === "reit"
          ? result.data.specialized
          : null,
        specialistDiagnostics: result.ok
          ? (result.data.diagnostics?.providerDiagnostics ?? []).filter((item) => item.capability === "specialized")
          : [],
        topLevelDiagnostic: result.diagnostic,
        failureReason: result.ok ? null : result.reason,
      });
    }

    console.log(`REIT_SPECIALIZED_DIAGNOSTIC ${JSON.stringify(rows)}`);

    const configuredUserAgent = process.env.SEC_USER_AGENT?.trim() ?? "";
    const userAgent = configuredUserAgent || STOCKBOX_CONTACT_USER_AGENT;
    const identities = [
      ...(configuredUserAgent ? [{ label: "configured", value: configuredUserAgent }] : []),
      { label: "stockbox_contact_url", value: STOCKBOX_CONTACT_USER_AGENT },
    ];
    const representativeCik = resolvedCiks.get("O") ?? resolvedCiks.get("PLD") ?? null;
    const endpoints = [
      {
        label: "ticker_universe",
        url: "https://www.sec.gov/files/company_tickers.json",
        accept: "application/json",
      },
      ...(representativeCik
        ? [{
            label: "submissions",
            url: `https://data.sec.gov/submissions/CIK${padCik(representativeCik)}.json`,
            accept: "application/json",
          }]
        : []),
    ];

    const secAccessRows: SecAccessProbe[] = [];
    for (const identity of identities) {
      for (const endpoint of endpoints) {
        secAccessRows.push(await probeSecEndpoint({
          identity: identity.label,
          userAgent: identity.value,
          endpoint: endpoint.label,
          url: endpoint.url,
          accept: endpoint.accept,
        }));
      }
    }

    const filingFingerprints = [] as Array<Record<string, unknown>>;
    for (const ticker of REIT_PROBE_TICKERS) {
      const cik = resolvedCiks.get(ticker);
      if (!cik) {
        filingFingerprints.push({ ticker, error: "missing_cik" });
        continue;
      }
      filingFingerprints.push(await rawReitFilingFingerprint(ticker, cik, userAgent));
    }

    const artifact = {
      generatedAt: new Date().toISOString(),
      rows,
      secAccessRows,
      filingFingerprints,
    };
    console.log(`SEC_REIT_RAW_FILING_FINGERPRINT ${JSON.stringify(filingFingerprints)}`);
    await mkdir("artifacts/coverage-live", { recursive: true });
    await writeFile(ARTIFACT_PATH, `${JSON.stringify(artifact, null, 2)}\n`, "utf-8");

    expect(rows).toHaveLength(REIT_PROBE_TICKERS.length);
    expect(secAccessRows.length).toBeGreaterThanOrEqual(identities.length);
    expect(filingFingerprints).toHaveLength(REIT_PROBE_TICKERS.length);
  }, 240_000);
});
