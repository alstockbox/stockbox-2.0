export type AlphaUniverseSource = "nasdaq_listed" | "other_listed";

export type AlphaUniverseSecurity = {
  source: "nasdaq_trader";
  sourceDataset: AlphaUniverseSource;
  sourceKey: string;
  ticker: string;
  name: string;
  exchange: string;
  country: "US";
  currency: "USD";
  eligible: true;
};

export type ParsedAlphaUniverse = {
  source: "nasdaq_trader";
  dataset: AlphaUniverseSource;
  sourceAsOf: string;
  securities: AlphaUniverseSecurity[];
};

const EXCLUDED_NAME_PATTERNS = [
  /\betf\b/i,
  /\betn\b/i,
  /\bexchange[- ]traded\b/i,
  /\bwarrant(s)?\b/i,
  /\bright(s)?\b/i,
  /\bunit(s)?\b/i,
  /\bpreferred\b/i,
  /\bdepositary shares\b/i,
  /\bdepository shares\b/i,
  /\bnotes?\b/i,
  /\bbond(s)?\b/i,
  /\bdebenture(s)?\b/i,
];

function normalizeLines(text: string): string[] {
  return text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function columnIndex(header: string[], candidates: string[]): number {
  const normalized = header.map((value) => value.trim().toLowerCase());
  return candidates
    .map((candidate) => normalized.indexOf(candidate.toLowerCase()))
    .find((index) => index >= 0) ?? -1;
}

function requiredColumn(header: string[], candidates: string[], label: string): number {
  const index = columnIndex(header, candidates);
  if (index < 0) throw new Error(`Nasdaq Trader universe is missing required ${label} column.`);
  return index;
}

function parseCreationTime(lines: string[]): string {
  const row = lines.find((line) => line.startsWith("File Creation Time:"));
  const match = row?.match(/File Creation Time:\s*(\d{2})(\d{2})(\d{4})(\d{2}):(\d{2})/i);
  if (!match) throw new Error("Nasdaq Trader universe is missing a valid file creation time.");
  const [, month, day, year, hour, minute] = match;
  return new Date(`${year}-${month}-${day}T${hour}:${minute}:00.000Z`).toISOString();
}

function exchangeFor(source: AlphaUniverseSource, raw: string | undefined): string {
  if (source === "nasdaq_listed") return "NASDAQ";
  switch ((raw ?? "").trim().toUpperCase()) {
    case "N": return "NYSE";
    case "A": return "NYSE American";
    case "P": return "NYSE Arca";
    case "Z": return "Cboe BZX";
    case "V": return "IEX";
    default: return "Other US Exchange";
  }
}

function excludedByName(name: string): boolean {
  return EXCLUDED_NAME_PATTERNS.some((pattern) => pattern.test(name));
}

export function parseNasdaqTraderDirectory(text: string, source: AlphaUniverseSource): ParsedAlphaUniverse {
  const lines = normalizeLines(text);
  if (lines.length < 2) throw new Error("Nasdaq Trader universe file is empty or malformed.");

  const sourceAsOf = parseCreationTime(lines);
  const header = lines[0]!.split("|").map((value) => value.trim());
  const tickerIndex = requiredColumn(
    header,
    source === "nasdaq_listed" ? ["Symbol"] : ["ACT Symbol", "NASDAQ Symbol"],
    "symbol",
  );
  const nameIndex = requiredColumn(header, ["Security Name"], "security name");
  const testIndex = requiredColumn(header, ["Test Issue"], "test issue");
  const etfIndex = requiredColumn(header, ["ETF"], "ETF");
  const exchangeIndex = source === "other_listed"
    ? requiredColumn(header, ["Exchange"], "exchange")
    : -1;

  const securities: AlphaUniverseSecurity[] = [];
  const seen = new Set<string>();

  for (const line of lines.slice(1)) {
    if (line.startsWith("File Creation Time:")) continue;
    const columns = line.split("|").map((value) => value.trim());
    const ticker = columns[tickerIndex]?.toUpperCase();
    const name = columns[nameIndex];
    const testIssue = columns[testIndex]?.toUpperCase();
    const etf = columns[etfIndex]?.toUpperCase();
    if (!ticker || !name || testIssue !== "N" || etf !== "N") continue;
    if (excludedByName(name)) continue;

    const sourceKey = `nasdaq_trader:${source}:${ticker}`;
    if (seen.has(sourceKey)) continue;
    seen.add(sourceKey);

    securities.push({
      source: "nasdaq_trader",
      sourceDataset: source,
      sourceKey,
      ticker,
      name,
      exchange: exchangeFor(source, exchangeIndex >= 0 ? columns[exchangeIndex] : undefined),
      country: "US",
      currency: "USD",
      eligible: true,
    });
  }

  return { source: "nasdaq_trader", dataset: source, sourceAsOf, securities };
}
