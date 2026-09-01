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
  sourceTimestampRaw: string;
  securities: AlphaUniverseSecurity[];
};

export type SecTickerIdentity = {
  ticker: string;
  cik: string;
  name: string;
  exchange: string | null;
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
  const match = row?.match(/File Creation Time:\s*(\d{8}\d{2}:\d{2})/i);
  if (!match?.[1]) throw new Error("Nasdaq Trader universe is missing a valid file creation time.");
  // Nasdaq documents the file timestamp format but does not state a timezone on the directory
  // definition page. Preserve the source value verbatim instead of fabricating a UTC instant.
  return match[1];
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

  const sourceTimestampRaw = parseCreationTime(lines);
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

  return { source: "nasdaq_trader", dataset: source, sourceTimestampRaw, securities };
}

export function parseSecTickerExchangeDirectory(payload: unknown): Map<string, SecTickerIdentity> {
  if (!payload || typeof payload !== "object") throw new Error("SEC ticker directory payload is invalid.");
  const record = payload as { fields?: unknown; data?: unknown };
  if (!Array.isArray(record.fields) || !Array.isArray(record.data)) throw new Error("SEC ticker directory payload is invalid.");

  const fields = record.fields.map((field) => String(field).trim().toLowerCase());
  const cikIndex = fields.indexOf("cik");
  const nameIndex = fields.indexOf("name");
  const tickerIndex = fields.indexOf("ticker");
  const exchangeIndex = fields.indexOf("exchange");
  if ([cikIndex, nameIndex, tickerIndex, exchangeIndex].some((index) => index < 0)) {
    throw new Error("SEC ticker directory is missing required identity fields.");
  }

  const result = new Map<string, SecTickerIdentity>();
  for (const raw of record.data) {
    if (!Array.isArray(raw)) continue;
    const tickerValue = raw[tickerIndex];
    const cikValue = raw[cikIndex];
    const nameValue = raw[nameIndex];
    if (typeof tickerValue !== "string" || !tickerValue.trim()) continue;
    const cikNumber = typeof cikValue === "number" ? cikValue : Number(cikValue);
    if (!Number.isFinite(cikNumber) || cikNumber <= 0) continue;
    const ticker = tickerValue.trim().toUpperCase();
    result.set(ticker, {
      ticker,
      cik: String(Math.trunc(cikNumber)).padStart(10, "0"),
      name: typeof nameValue === "string" && nameValue.trim() ? nameValue.trim() : ticker,
      exchange: typeof raw[exchangeIndex] === "string" && raw[exchangeIndex].trim() ? raw[exchangeIndex].trim() : null,
    });
  }
  return result;
}
