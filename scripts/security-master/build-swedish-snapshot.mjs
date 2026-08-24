import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const NASDAQ_BASE = "https://api.nasdaq.com/api/nordic/screener/shares";
const SPOTLIGHT_URL = "https://www.spotlightstockmarket.com/en/market-overview/share-prices/search-share-prices-and-trades/";
const SPOTLIGHT_SEARCH_URL = "https://www.spotlightstockmarket.com/Umbraco/api/companyapi/CompanySimpleSearch";
const NGM_LIST_URL = "https://ngm-api-prod.vmate.se/instrument/list";
const SNAPSHOT_PATH = path.resolve("src/data/security-master/sweden.generated.json");
const REFRESHED_AT = new Date().toISOString().slice(0, 10);

const NASDAQ_SEGMENTS = [
  { venue: "NASDAQ_STOCKHOLM_MAIN", segment: "Large Cap", segmentCode: "LARGE_CAP", market: "STO" },
  { venue: "NASDAQ_STOCKHOLM_MAIN", segment: "Mid Cap", segmentCode: "MID_CAP", market: "STO" },
  { venue: "NASDAQ_STOCKHOLM_MAIN", segment: "Small Cap", segmentCode: "SMALL_CAP", market: "STO" },
  { venue: "NASDAQ_STOCKHOLM_MAIN", segment: "SPAC", segmentCode: "SPAC", market: "STO" },
  { venue: "NASDAQ_FIRST_NORTH_STOCKHOLM", segment: "First North Premier", segmentCode: "FN_PREMIER", market: "STO" },
  { venue: "NASDAQ_FIRST_NORTH_STOCKHOLM", segment: "First North Growth Market", segmentCode: "FN_GM", market: "STO" },
];

const VENUE_CONFIG = {
  NASDAQ_STOCKHOLM_MAIN: {
    exchange: "Nasdaq Stockholm",
    mic: "XSTO",
    source: "Nasdaq Nordic screener/reference API",
    sourceUrl: "https://api.nasdaq.com/api/nordic/screener/shares",
  },
  NASDAQ_FIRST_NORTH_STOCKHOLM: {
    exchange: "Nasdaq First North Growth Market Stockholm",
    mic: "FNSE",
    source: "Nasdaq Nordic screener/reference API",
    sourceUrl: "https://api.nasdaq.com/api/nordic/screener/shares",
  },
  SPOTLIGHT: {
    exchange: "Spotlight Stock Market",
    mic: "XSAT",
    source: "Spotlight Stock Market instrument search",
    sourceUrl: SPOTLIGHT_URL,
  },
  NGM_MAIN_REGULATED: {
    exchange: "Nordic Growth Market Main Regulated",
    mic: "XNGM",
    source: "NGM instrument reference API",
    sourceUrl: "https://ngm-api-prod.vmate.se/instrument/list",
  },
  NGM_GROWTH_NORDIC_SME: {
    exchange: "Nordic SME",
    mic: "NSME",
    source: "NGM instrument reference API",
    sourceUrl: "https://ngm-api-prod.vmate.se/instrument/list",
  },
};

const TEMPORARY_INSTRUMENT_TOKENS = new Set(["BTA", "BTU", "TR", "UR", "TO"]);

function assertString(value, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

async function fetchText(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      "accept": options.accept ?? "application/json,text/html;q=0.9,*/*;q=0.8",
      "user-agent": "StockBoxSecurityMaster/1.0 security-reference-refresh",
    },
  });
  if (!response.ok) throw new Error(`Request failed ${response.status} for ${url}`);
  return response.text();
}

async function fetchJson(url) {
  return JSON.parse(await fetchText(url, { accept: "application/json" }));
}

async function postJson(url) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "accept": "application/json",
      "user-agent": "StockBoxSecurityMaster/1.0 security-reference-refresh",
    },
  });
  if (!response.ok) throw new Error(`Request failed ${response.status} for ${url}`);
  return response.json();
}

function slug(value) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function cleanTicker(value) {
  return assertString(value)
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function tickerDash(value) {
  return cleanTicker(value).replace(/\s+/g, "-");
}

function providerTickers(localTicker) {
  const ticker = cleanTicker(localTicker);
  const dashed = tickerDash(ticker);
  const dotted = ticker.replace(/\s+/g, ".");
  const compact = ticker.replace(/[\s.-]+/g, "");
  return [...new Set([
    ticker,
    dotted,
    dashed,
    `${dotted}.ST`,
    `${dashed}.ST`,
    `${compact}.ST`,
  ].filter(Boolean))];
}

function issuerNameFromSecurityName(name) {
  return assertString(name)
    .replace(/\s+(ser\.?|series|class)\s+[A-Z0-9]+$/i, "")
    .replace(/\s+[A-Z]$/i, "")
    .replace(/\s+(pref|preference share|preferred share)$/i, "")
    .trim();
}

function shareClass(ticker, name) {
  const text = `${ticker} ${name}`;
  const match = text.match(/\b(?:ser\.?|series|class)\s+([A-Z0-9]+)\b/i) ?? text.match(/\b([A-Z])$/);
  return match?.[1]?.toUpperCase() ?? null;
}

function securityType(ticker, name) {
  const text = `${ticker} ${name}`.toLowerCase();
  if (/\b(preference|preferred|pref)\b/.test(text)) return "Preferred";
  if (/\b(etf|fund|tracker|index)\b/.test(text)) return "ETF/Fund";
  if (/\badr\b/.test(text)) return "ADR";
  return "Common Stock";
}

function aliases({ ticker, name, issuerName, isin }) {
  const base = [
    ticker,
    tickerDash(ticker),
    ticker.replace(/\s+/g, "."),
    name,
    issuerName,
    issuerNameFromSecurityName(name),
    isin,
  ];
  return [...new Set(base.map((value) => assertString(value)).filter(Boolean))];
}

function sourceToken(source, value) {
  const token = assertString(value) || slug(`${source.name}-${source.ticker}`);
  return token.replace(/[^A-Za-z0-9._:-]+/g, "-");
}

function normalizeIsin(value) {
  const isin = assertString(value).toUpperCase();
  return /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin) ? isin : undefined;
}

function toSecurity(source) {
  const config = VENUE_CONFIG[source.venue];
  const ticker = cleanTicker(source.ticker);
  const name = assertString(source.name, ticker);
  const issuerName = assertString(source.issuerName) || issuerNameFromSecurityName(name);
  const type = source.securityType ?? securityType(ticker, name);
  const canonicalTicker = `${tickerDash(ticker)}.ST`;
  const token = sourceToken(source, source.nativeId ?? source.isin ?? ticker);
  return {
    securityId: `${config.mic.toLowerCase()}:${token.toLowerCase()}`,
    issuerId: `issuer:se:${slug(issuerName || name)}`,
    ticker,
    canonicalTicker,
    localTicker: ticker,
    providerTickers: providerTickers(ticker),
    name,
    issuerName: issuerName || name,
    isin: normalizeIsin(source.isin),
    exchange: config.exchange,
    mic: config.mic,
    venue: source.venue,
    marketSegment: source.marketSegment,
    country: "SE",
    currency: "SEK",
    securityType: type,
    primarySecurity: type === "Common Stock",
    primaryListing: false,
    analysisCapability: {
      fundamentals: "unavailable",
      marketData: "available",
      reason: "Security is discoverable in the listed-security master; StockBox fundamentals are enabled only where a configured fundamentals provider supports the issuer.",
    },
    aliases: aliases({ ticker, name, issuerName, isin: source.isin }),
    source: config.source,
    sourceUrl: source.sourceUrl ?? config.sourceUrl,
    sourceUpdatedAt: REFRESHED_AT,
  };
}

async function fetchNasdaqSecurities() {
  const securities = [];
  for (const config of NASDAQ_SEGMENTS) {
    const url = new URL(NASDAQ_BASE);
    url.searchParams.set("category", config.venue === "NASDAQ_STOCKHOLM_MAIN" ? "MAIN_MARKET" : "FIRST_NORTH");
    url.searchParams.set("tableonly", "false");
    url.searchParams.set("market", config.market);
    url.searchParams.set("segment", config.segmentCode);
    const payload = await fetchJson(url);
    const rows = Array.isArray(payload?.data?.instrumentListing?.rows)
      ? payload.data.instrumentListing.rows
      : Array.isArray(payload?.data?.shares)
        ? payload.data.shares
        : [];
    for (const row of rows) {
      securities.push(toSecurity({
        venue: config.venue,
        marketSegment: config.segment,
        ticker: assertString(row.symbol),
        name: assertString(row.name || row.fullName || row.symbol),
        issuerName: issuerNameFromSecurityName(assertString(row.issuerFullName || row.name || row.fullName || row.symbol)),
        isin: assertString(row.isin),
        nativeId: assertString(row.orderbookId),
        sourceUrl: `${NASDAQ_BASE}?category=${config.venue === "NASDAQ_STOCKHOLM_MAIN" ? "MAIN_MARKET" : "FIRST_NORTH"}&market=STO&segment=${config.segmentCode}`,
      }));
    }
  }
  return dedupeBySecurityId(securities);
}

function stripHtml(value) {
  return value
    .replace(/\\u0026/g, "&")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/<[^>]*>/g, "");
}

function parseSpotlightHeading(heading) {
  const text = stripHtml(assertString(heading)).replace(/\s+/g, " ").trim();
  const match = text.match(/^(.*?)\s+\(([^()]+)\)$/);
  if (!match) return null;
  return { name: match[1].trim(), ticker: cleanTicker(match[2]) };
}

function isTemporaryTicker(ticker) {
  const tokens = ticker.toUpperCase().split(/[\s.-]+/).filter(Boolean);
  return tokens.some((token) => TEMPORARY_INSTRUMENT_TOKENS.has(token));
}

async function fetchSpotlightSecurities() {
  await fetchText(SPOTLIGHT_URL, { accept: "text/html" });
  const entries = new Map();
  for (const searchText of "abcdefghijklmnopqrstuvwxyz".split("")) {
    const url = new URL(SPOTLIGHT_SEARCH_URL);
    url.searchParams.set("searchText", searchText);
    url.searchParams.set("lang", "en-US");
    url.searchParams.set("getAll", "true");
    const payload = await postJson(url);
    for (const entry of Array.isArray(payload?.results) ? payload.results : []) {
      const sourceUrl = assertString(entry.url);
      const instrumentId = sourceUrl.match(/InstrumentId=([^&]+)/)?.[1] ?? "";
      if (!sourceUrl.includes("/companies/irabout") || !instrumentId) continue;
      entries.set(instrumentId, { ...entry, instrumentId });
    }
  }
  const securities = [...entries.values()].flatMap((entry) => {
    const parsed = parseSpotlightHeading(entry.heading ?? entry.companyName);
    if (!parsed || !parsed.ticker || !parsed.name || isTemporaryTicker(parsed.ticker)) return [];
    return [toSecurity({
      venue: "SPOTLIGHT",
      marketSegment: "Spotlight Stock Market",
      ticker: parsed.ticker,
      name: parsed.name,
      issuerName: issuerNameFromSecurityName(parsed.name),
      nativeId: entry.instrumentId,
      sourceUrl: `https://www.spotlightstockmarket.com${assertString(entry.url)}`,
    })];
  });
  return dedupeBySecurityId(securities);
}

async function fetchNgmSecurities() {
  const url = new URL(NGM_LIST_URL);
  url.searchParams.set("page", "0");
  url.searchParams.set("size", "500");
  url.searchParams.set("market", "equities");
  url.searchParams.set("instrumentType", "Shares");
  url.searchParams.set("sortField", "name");
  url.searchParams.set("sortDirection", "asc");
  const payload = await fetchJson(url);
  const rows = Array.isArray(payload?.data)
    ? payload.data
    : Array.isArray(payload?.content)
      ? payload.content
      : [];
  const securities = rows.flatMap((row) => {
    const ticker = cleanTicker(row.symbol);
    const name = assertString(row.name);
    if (!ticker || !name || isTemporaryTicker(ticker)) return [];
    const marketSegment = assertString(row.marketSegment);
    return [toSecurity({
      venue: marketSegment === "NGM Main Market" ? "NGM_MAIN_REGULATED" : "NGM_GROWTH_NORDIC_SME",
      marketSegment: marketSegment || "Nordic SME",
      ticker,
      name,
      issuerName: issuerNameFromSecurityName(assertString(row.issuer) || name),
      isin: assertString(row.isin),
      nativeId: assertString(row.insref) || ticker,
    })];
  });
  return dedupeBySecurityId(securities);
}

function dedupeBySecurityId(securities) {
  return [...new Map(securities.map((security) => [security.securityId, security])).values()];
}

function assignPrimaryListings(securities) {
  const byIssuer = new Map();
  for (const security of securities) {
    byIssuer.set(security.issuerId, [...(byIssuer.get(security.issuerId) ?? []), security]);
  }
  for (const issuerSecurities of byIssuer.values()) {
    const common = issuerSecurities.filter((security) => security.securityType === "Common Stock");
    const candidates = common.length ? common : issuerSecurities;
    const preferred =
      candidates.find((security) => shareClass(security.ticker, security.name) === "B")
      ?? candidates.find((security) => !shareClass(security.ticker, security.name))
      ?? candidates[0];
    for (const security of issuerSecurities) {
      security.primaryListing = security.securityId === preferred.securityId;
      security.primarySecurity = security.securityId === preferred.securityId || (security.securityType === "Common Stock" && !shareClass(security.ticker, security.name));
    }
  }
}

function countsByVenue(securities) {
  const counts = {
    NASDAQ_STOCKHOLM_MAIN: 0,
    NASDAQ_FIRST_NORTH_STOCKHOLM: 0,
    SPOTLIGHT: 0,
    NGM_MAIN_REGULATED: 0,
    NGM_GROWTH_NORDIC_SME: 0,
  };
  for (const security of securities) counts[security.venue] += 1;
  return counts;
}

async function main() {
  const [nasdaq, spotlight, ngm] = await Promise.all([
    fetchNasdaqSecurities(),
    fetchSpotlightSecurities(),
    fetchNgmSecurities(),
  ]);
  const securities = dedupeBySecurityId([...nasdaq, ...spotlight, ...ngm])
    .sort((left, right) => left.venue.localeCompare(right.venue) || left.ticker.localeCompare(right.ticker));
  assignPrimaryListings(securities);
  const expectedVenueCounts = countsByVenue(securities);
  const snapshot = {
    metadata: {
      providerId: "swedish-listed-security-master",
      sourceName: "Swedish listed security master",
      sourceUrls: [
        NASDAQ_BASE,
        SPOTLIGHT_URL,
        NGM_LIST_URL,
      ],
      refreshMode: "configured_feed",
      refreshedAt: REFRESHED_AT,
      notes: [
        "Generated from Nasdaq Nordic screener/reference endpoints, Spotlight instrument search data, and the NGM instrument reference API.",
        "Discovery capability is intentionally separate from fundamentals capability.",
        "Issuer identifiers are StockBox-normalized keys; listing/security identifiers retain exchange MIC plus source-native instrument identifiers where available.",
      ],
      expectedVenueCounts,
    },
    securities,
  };
  await mkdir(path.dirname(SNAPSHOT_PATH), { recursive: true });
  await writeFile(SNAPSHOT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(`Wrote ${securities.length} Swedish listed securities to ${SNAPSHOT_PATH}`);
  console.log(JSON.stringify(expectedVenueCounts, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
