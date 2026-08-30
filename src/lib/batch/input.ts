import type { CompanySearchResult } from "@/lib/analysis/types";

export const MAX_BATCH_ROWS = 50;
const HEADER_VALUES = new Set(["TICKER", "TICKERS", "SYMBOL", "SYMBOLS"]);

export type ParsedBatchInput = {
  symbols: string[];
  duplicates: string[];
  invalid: string[];
  overLimit: boolean;
};

export function normalizeBatchSymbol(value: string): string {
  return value.trim().replace(/^["']|["']$/g, "").toUpperCase();
}

function tokenizeBatchInput(raw: string): string[] {
  const lines = raw.replace(/\r/g, "").split("\n").filter((line) => line.trim());
  const firstLine = lines[0]?.trim() ?? "";
  const hasCsvHeader = /^(?:"?(?:ticker|symbol)"?)[,;\t]/i.test(firstLine);

  if (hasCsvHeader) {
    return lines.slice(1).map((line) => line.split(/[,;\t]/, 1)[0]);
  }

  return raw.replace(/\r/g, "\n").split(/[\s,;]+/);
}

export function parseBatchInput(raw: string): ParsedBatchInput {
  const symbols: string[] = [];
  const duplicates: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();
  const tokens = tokenizeBatchInput(raw)
    .map(normalizeBatchSymbol)
    .filter(Boolean);

  for (const token of tokens) {
    if (HEADER_VALUES.has(token)) continue;
    if (!/^[A-Z0-9^][A-Z0-9.^=-]{0,15}$/.test(token)) {
      invalid.push(token);
      continue;
    }
    if (seen.has(token)) {
      duplicates.push(token);
      continue;
    }
    seen.add(token);
    symbols.push(token);
  }

  return {
    symbols,
    duplicates,
    invalid,
    overLimit: symbols.length > MAX_BATCH_ROWS,
  };
}
function companySymbol(company: CompanySearchResult): string {
  return normalizeBatchSymbol(company.canonicalTicker ?? company.ticker);
}

function exactBatchSymbols(company: CompanySearchResult): string[] {
  const symbols = new Set<string>();
  const canonical = company.canonicalTicker ? normalizeBatchSymbol(company.canonicalTicker) : null;
  const ticker = normalizeBatchSymbol(company.ticker);
  if (canonical) symbols.add(canonical);
  if (!canonical || canonical === ticker || !canonical.includes(".")) symbols.add(ticker);
  return [...symbols];
}

export function findExactBatchCompany(
  symbol: string,
  results: CompanySearchResult[],
): CompanySearchResult | null {
  const normalizedSymbol = normalizeBatchSymbol(symbol);
  const exact = results.filter((company) =>
    exactBatchSymbols(company).some((value) => value === normalizedSymbol),
  );

  return exact.sort((left, right) => {
    const leftScore =
      Number(companySymbol(left) === normalizedSymbol) * 4 +
      Number(left.securityType === "Common Stock") * 2 +
      Number(Boolean(left.providerCapabilities?.fundamentals));
    const rightScore =
      Number(companySymbol(right) === normalizedSymbol) * 4 +
      Number(right.securityType === "Common Stock") * 2 +
      Number(Boolean(right.providerCapabilities?.fundamentals));
    return rightScore - leftScore;
  })[0] ?? null;
}
export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index], index);
    }
  }

  const workerCount = Math.min(Math.max(1, concurrency), items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}
