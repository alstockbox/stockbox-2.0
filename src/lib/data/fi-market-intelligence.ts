import type { CompanySearchResult, InsiderTransaction, ResearchLayerPayload } from "@/lib/analysis/types";
import { providerDiagnostic, type AdapterResult } from "./providers";

export type FiShortPosition = {
  issuerName: string;
  lei: string | null;
  positionDate: string;
  aggregateShortPercent: number;
};

function normalizeText(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\b(AKTIEBOLAGET|AKTIEBOLAG|PUBL|AB)\b/g, " ")
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function issuerMatches(expected: string, actual: string): boolean {
  const left = normalizeText(expected);
  const right = normalizeText(actual);
  if (!left || !right) return false;
  if (left === right) return true;
  const leftTokens = new Set(left.split(" ").filter((token) => token.length > 2));
  const rightTokens = new Set(right.split(" ").filter((token) => token.length > 2));
  if (!leftTokens.size || !rightTokens.size) return false;
  const overlap = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  return overlap / Math.max(leftTokens.size, rightTokens.size) >= 0.8;
}

function parseNumber(value: string | null | undefined): number | null {
  const normalized = (value ?? "").trim().replace(/\s/g, "").replace(/,/g, ".");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeDate(value: string | null | undefined): string | null {
  const raw = (value ?? "").trim();
  const iso = raw.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const swedish = raw.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (swedish) return `${swedish[1]}-${swedish[2].padStart(2, "0")}-${swedish[3].padStart(2, "0")}`;
  const reversed = raw.match(/(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{4})/);
  return reversed ? `${reversed[3]}-${reversed[2].padStart(2, "0")}-${reversed[1].padStart(2, "0")}` : null;
}

function detectDelimiter(header: string): string {
  const candidates = [";", "\t", ","];
  return candidates.sort((a, b) => header.split(b).length - header.split(a).length)[0];
}

function parseDelimited(text: string): string[][] {
  const normalized = text.replace(/^\uFEFF/, "");
  const delimiter = detectDelimiter(normalized.split(/\r?\n/, 1)[0] ?? ";");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    if (char === '"') {
      if (quoted && normalized[index + 1] === '"') { cell += '"'; index += 1; }
      else quoted = !quoted;
      continue;
    }
    if (!quoted && char === delimiter) { row.push(cell); cell = ""; continue; }
    if (!quoted && (char === "\n" || char === "\r")) {
      if (char === "\r" && normalized[index + 1] === "\n") index += 1;
      row.push(cell); cell = "";
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      continue;
    }
    cell += char;
  }
  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

function normalizeHeader(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function transactionTypeFromCharacter(value: string): InsiderTransaction["transactionType"] {
  const normalized = normalizeText(value);
  if (/FORVARV|KOP|PURCHASE|ACQUISITION/.test(normalized)) return "open_market_buy";
  if (/AVYTTRING|SALJ|SALE|DISPOSAL/.test(normalized)) return "open_market_sell";
  return "other";
}

export function parseFiInsiderCsv(csv: string, expectedIssuer: string): InsiderTransaction[] {
  const rows = parseDelimited(csv);
  if (rows.length < 2) return [];
  const headers = rows[0].map(normalizeHeader);
  const indexOf = (...names: string[]) => headers.findIndex((header) => names.map(normalizeHeader).includes(header));
  const issuerIndex = indexOf("Emittent", "Utgivare");
  const roleIndex = indexOf("Befattning");
  const characterIndex = indexOf("Karaktär", "Karaktar");
  const dateIndex = indexOf("Transaktionsdatum");
  const volumeIndex = indexOf("Volym");
  const priceIndex = indexOf("Pris");
  if ([issuerIndex, characterIndex, dateIndex].some((index) => index < 0)) return [];

  return rows.slice(1).flatMap((row) => {
    const issuer = row[issuerIndex]?.trim() ?? "";
    if (!issuerMatches(expectedIssuer, issuer)) return [];
    const date = normalizeDate(row[dateIndex]);
    if (!date) return [];
    const shares = volumeIndex >= 0 ? parseNumber(row[volumeIndex]) : null;
    const price = priceIndex >= 0 ? parseNumber(row[priceIndex]) : null;
    const value = shares !== null && price !== null ? Math.abs(shares * price) : null;
    return [{
      transactionType: transactionTypeFromCharacter(row[characterIndex] ?? ""),
      insiderRole: roleIndex >= 0 ? row[roleIndex]?.trim() || null : null,
      shares,
      value,
      ownershipChange: null,
      date,
      automaticPlan: false,
    } satisfies InsiderTransaction];
  }).sort((left, right) => right.date.localeCompare(left.date));
}

function decodeHtml(value: string): string {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseFiShortRegisterHtml(
  html: string,
  company: { name: string; lei?: string | null },
): FiShortPosition | null {
  const rows = [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)];
  for (const match of rows) {
    const cells = [...match[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cell) => decodeHtml(cell[1]));
    if (cells.length < 4) continue;
    const [issuerName, lei, positionDateRaw, percentRaw] = cells;
    const leiMatch = company.lei?.trim() && lei.trim().toUpperCase() === company.lei.trim().toUpperCase();
    if (!leiMatch && !issuerMatches(company.name, issuerName)) continue;
    const positionDate = normalizeDate(positionDateRaw);
    const aggregateShortPercent = parseNumber(percentRaw);
    if (!positionDate || aggregateShortPercent === null || aggregateShortPercent < 0 || aggregateShortPercent > 100) continue;
    return { issuerName, lei: lei.trim() || null, positionDate, aggregateShortPercent };
  }
  return null;
}

function isSwedishCompany(company: Pick<CompanySearchResult, "country" | "ticker" | "canonicalTicker">): boolean {
  const country = (company.country ?? "").trim().toUpperCase();
  return ["SE", "SWEDEN", "SVERIGE"].includes(country) || /\.ST$/i.test(company.canonicalTicker ?? company.ticker);
}

function decodeFiBuffer(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes);
  const sample = bytes.slice(0, Math.min(bytes.length, 200));
  const nullRatio = [...sample].filter((byte) => byte === 0).length / Math.max(1, sample.length);
  return new TextDecoder(nullRatio > 0.15 ? "utf-16le" : "utf-8").decode(bytes);
}

export async function fetchFiInsiderTransactions(
  company: CompanySearchResult,
  options: { fetcher?: typeof fetch } = {},
): Promise<AdapterResult<ResearchLayerPayload<InsiderTransaction[]>>> {
  if (!isSwedishCompany(company)) return { ok: false, reason: "unsupported_symbol", message: "FI insider data is only applicable to Swedish issuers.", diagnostic: providerDiagnostic("fi-insider", "insider", "unsupported", "non_swedish_issuer") };
  const endpoint = new URL("https://marknadssok.fi.se/Publiceringsklient/sv-SE/Search/Search");
  endpoint.searchParams.set("SearchFunctionType", "Insyn");
  endpoint.searchParams.set("Utgivare", company.name);
  endpoint.searchParams.set("PersonILedandeStällningNamn", "");
  endpoint.searchParams.set("button", "export");
  endpoint.searchParams.set("Page", "1");
  try {
    const response = await (options.fetcher ?? fetch)(endpoint, { headers: { Accept: "text/csv,text/plain,*/*" }, signal: AbortSignal.timeout(8_000) });
    if (response.status === 429) return { ok: false, reason: "rate_limited", message: "FI insider registry rate limit reached.", diagnostic: providerDiagnostic("fi-insider", "insider", "unavailable", "rate_limited") };
    if (!response.ok) return { ok: false, reason: "upstream_error", message: `FI insider registry returned HTTP ${response.status}.`, diagnostic: providerDiagnostic("fi-insider", "insider", "unavailable", `http_${response.status}`) };
    const transactions = parseFiInsiderCsv(decodeFiBuffer(await response.arrayBuffer()), company.name).slice(0, 100);
    const accessedAt = new Date().toISOString();
    const dataAsOf = transactions[0]?.date ?? null;
    const source = { name: "Finansinspektionen — Insynsregistret", url: "https://www.fi.se/sv/vara-register/insynsregistret/", accessedAt, freshness: "FI register data is published continuously; StockBox records the access date.", provider: "fi-insider", capability: "insider" as const, dataAsOf, version: "fi-insider-adapter-v1" };
    return {
      ok: true,
      data: { data: transactions, dataAsOf, coverage: transactions.length ? 1 : 0.5, confidence: transactions.length ? 90 : 70, evidence: [{ id: `fi-insider-${dataAsOf ?? accessedAt.slice(0, 10)}`, kind: "reported_fact", sourceTier: "official_regulator", title: "FI Insynsregistret", source, dataAsOf }] },
      diagnostic: providerDiagnostic("fi-insider", "insider", transactions.length ? "available" : "partial", transactions.length ? undefined : "no_recent_transactions"),
    };
  } catch (error) {
    const reason = error instanceof Error && error.name === "TimeoutError" ? "timeout" : "upstream_error";
    return { ok: false, reason, message: "FI insider registry request failed.", diagnostic: providerDiagnostic("fi-insider", "insider", "unavailable", reason) };
  }
}

export async function fetchFiShortPosition(
  company: CompanySearchResult,
  identity: { lei?: string | null } = {},
  options: { fetcher?: typeof fetch } = {},
): Promise<AdapterResult<ResearchLayerPayload<FiShortPosition | null>>> {
  if (!isSwedishCompany(company)) return { ok: false, reason: "unsupported_symbol", message: "FI short-position data is only applicable to Swedish issuers under FI supervision.", diagnostic: providerDiagnostic("fi-short", "positioning", "unsupported", "non_swedish_issuer") };
  const endpoint = "https://www.fi.se/sv/vara-register/blankningsregistret/";
  try {
    const response = await (options.fetcher ?? fetch)(endpoint, { headers: { Accept: "text/html" }, signal: AbortSignal.timeout(8_000) });
    if (response.status === 429) return { ok: false, reason: "rate_limited", message: "FI short registry rate limit reached.", diagnostic: providerDiagnostic("fi-short", "positioning", "unavailable", "rate_limited") };
    if (!response.ok) return { ok: false, reason: "upstream_error", message: `FI short registry returned HTTP ${response.status}.`, diagnostic: providerDiagnostic("fi-short", "positioning", "unavailable", `http_${response.status}`) };
    const position = parseFiShortRegisterHtml(await response.text(), { name: company.name, lei: identity.lei ?? company.lei });
    const accessedAt = new Date().toISOString();
    const dataAsOf = position?.positionDate ?? accessedAt.slice(0, 10);
    const source = { name: "Finansinspektionen — Blankningsregistret", url: endpoint, accessedAt, freshness: "FI aggregate short-position register; positions below the reporting threshold are not included.", provider: "fi-short", capability: "positioning" as const, dataAsOf, version: "fi-short-adapter-v1" };
    return {
      ok: true,
      data: { data: position, dataAsOf, coverage: position ? 1 : 0.7, confidence: position ? 90 : 75, evidence: [{ id: `fi-short-${dataAsOf}`, kind: "reported_fact", sourceTier: "official_regulator", title: "FI Blankningsregistret", source, dataAsOf }] },
      diagnostic: providerDiagnostic("fi-short", "positioning", position ? "available" : "partial", position ? undefined : "issuer_not_listed_in_current_register"),
    };
  } catch (error) {
    const reason = error instanceof Error && error.name === "TimeoutError" ? "timeout" : "upstream_error";
    return { ok: false, reason, message: "FI short registry request failed.", diagnostic: providerDiagnostic("fi-short", "positioning", "unavailable", reason) };
  }
}
