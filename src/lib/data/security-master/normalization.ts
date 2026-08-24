import type { ListedSecurity } from "./types";

const SWEDISH_MARKET_SUFFIX = /\.(ST|SS)$/i;
const COMPANY_SUFFIXES = /\b(ab|publ|plc|inc|corp|corporation|ltd|limited|aktiebolag|ser|series|class|common|share|shares)\b/g;

export function normalizeText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function normalizeName(value: string): string {
  return normalizeText(value).replace(COMPANY_SUFFIXES, " ").replace(/\s+/g, " ").trim();
}

export function normalizeTicker(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(SWEDISH_MARKET_SUFFIX, "")
    .replace(/[:/]/g, " ")
    .replace(/[.\-\s]/g, "");
}

export function uniqueValues(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))];
}

export function swedishTickerVariants(ticker: string): string[] {
  const local = ticker.trim().toUpperCase().replace(/\s+/g, " ");
  const dot = local.replace(/\s+/g, ".");
  const dash = local.replace(/\s+/g, "-");
  const compact = local.replace(/\s+/g, "");
  return uniqueValues([local, dot, dash, compact, `${dot}.ST`, `${dash}.ST`, `${compact}.ST`]);
}

export function securityTickerCandidates(security: Pick<ListedSecurity, "ticker" | "canonicalTicker" | "localTicker" | "providerTickers">): string[] {
  return uniqueValues([
    security.ticker,
    security.canonicalTicker,
    security.localTicker,
    ...(security.providerTickers ?? []),
  ]);
}

export function securitySearchAliases(security: ListedSecurity): string[] {
  return uniqueValues([
    security.issuerName,
    normalizeName(security.issuerName),
    security.name,
    normalizeName(security.name),
    ...securityTickerCandidates(security),
    ...security.aliases,
  ]);
}
