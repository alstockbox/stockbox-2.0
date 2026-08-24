const SYMBOLS = ["AAPL", "MSFT", "NVDA", "SPY"];
const TRADING_DAYS = { "3M": 63, "1Y": 252 };

function providerChain() {
  const primary = (process.env.MARKET_DATA_PROVIDER || "stooq").trim().toLowerCase();
  const fallback = (process.env.MARKET_DATA_FALLBACK_PROVIDERS || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  return [...new Set([primary, ...fallback].filter((provider) => provider !== "disabled"))];
}

function splitCsvRow(line) {
  const values = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === "\"") {
      if (quoted && line[index + 1] === "\"") {
        value += "\"";
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      values.push(value.trim());
      value = "";
    } else {
      value += character;
    }
  }
  values.push(value.trim());
  return values;
}

function parseCsvHistory(csv) {
  const body = csv.replace(/^\uFEFF/, "").trim();
  if (!body || /^<!doctype html|^<html/i.test(body)) return { ok: false, reason: "html_response" };
  const [header = "", ...lines] = body.split(/\r?\n/);
  const columns = splitCsvRow(header).map((column) => column.toLowerCase());
  const dateIndex = columns.indexOf("date");
  const closeIndex = columns.indexOf("close");
  if (dateIndex < 0 || closeIndex < 0) return { ok: false, reason: "unexpected_columns" };
  const rows = lines.flatMap((line) => {
    if (!line.trim()) return [];
    const values = splitCsvRow(line);
    const date = values[dateIndex];
    const close = Number(values[closeIndex]);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(close) || close <= 0) return [];
    return [{ date, close }];
  });
  return rows.length ? { ok: true, rows } : { ok: false, reason: "empty_response" };
}

function performance(rows, days) {
  const latest = rows.at(-1);
  const prior = rows.at(-1 - days);
  return latest && prior && prior.close > 0 ? latest.close / prior.close - 1 : null;
}

async function fetchStooq(symbol) {
  const stooqSymbol = `${symbol.toLowerCase().replace(/\./g, "-")}.us`;
  try {
    const response = await fetch(`https://stooq.com/q/d/l/?s=${encodeURIComponent(stooqSymbol)}&i=d`);
    const body = await response.text();
    if (!response.ok) return { ok: false, reason: response.status === 429 ? "rate_limited" : "upstream_error" };
    const parsed = parseCsvHistory(body);
    if (!parsed.ok) return parsed;
    return {
      ok: true,
      provider: "stooq-eod",
      date: parsed.rows.at(-1)?.date ?? null,
      historyLength: parsed.rows.length,
      momentum3MAvailable: performance(parsed.rows, TRADING_DAYS["3M"]) !== null,
      momentum1YAvailable: performance(parsed.rows, TRADING_DAYS["1Y"]) !== null,
      betaAvailable: false,
      marketCapAvailable: false,
    };
  } catch {
    return { ok: false, reason: "upstream_error" };
  }
}

async function fetchTwelveData(symbol) {
  const apiKey = process.env.TWELVE_DATA_API_KEY?.trim();
  if (!apiKey) return { ok: false, reason: "not_configured" };
  const url = new URL("https://api.twelvedata.com/time_series");
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("interval", "1day");
  url.searchParams.set("outputsize", "400");
  url.searchParams.set("order", "ASC");
  url.searchParams.set("apikey", apiKey);
  try {
    const response = await fetch(url);
    if (!response.ok) return { ok: false, reason: response.status === 429 ? "rate_limited" : "upstream_error" };
    const payload = await response.json();
    if (payload?.status === "error") return { ok: false, reason: payload.code === 429 ? "rate_limited" : "upstream_error" };
    const rows = Array.isArray(payload?.values)
      ? payload.values.flatMap((row) => {
        const date = typeof row.datetime === "string" ? row.datetime.slice(0, 10) : "";
        const close = Number(row.close);
        return /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(close) && close > 0 ? [{ date, close }] : [];
      })
      : [];
    if (!rows.length) return { ok: false, reason: "empty_response" };
    return {
      ok: true,
      provider: "twelve-data",
      date: rows.at(-1)?.date ?? null,
      historyLength: rows.length,
      momentum3MAvailable: performance(rows, TRADING_DAYS["3M"]) !== null,
      momentum1YAvailable: performance(rows, TRADING_DAYS["1Y"]) !== null,
      betaAvailable: null,
      marketCapAvailable: null,
    };
  } catch {
    return { ok: false, reason: "upstream_error" };
  }
}

async function probe(symbol) {
  const attemptedProviders = [];
  for (const provider of providerChain()) {
    const result = provider === "twelve_data" ? await fetchTwelveData(symbol)
      : provider === "stooq" ? await fetchStooq(symbol)
        : { ok: false, reason: "not_configured" };
    attemptedProviders.push({
      provider: provider === "twelve_data" ? "twelve-data" : provider === "stooq" ? "stooq-eod" : provider,
      status: result.ok ? "available" : "unavailable",
      reason: result.ok ? undefined : result.reason,
    });
    if (result.ok) {
      return {
        symbol,
        status: "available",
        attemptedProviders,
        resolvedProvider: result.provider,
        reason: null,
        priceDate: result.date,
        historyLength: result.historyLength,
        momentum3MAvailable: result.momentum3MAvailable,
        momentum1YAvailable: result.momentum1YAvailable,
        betaAvailable: Boolean(result.betaAvailable),
        marketCapAvailable: Boolean(result.marketCapAvailable),
      };
    }
  }
  return {
    symbol,
    status: "unavailable",
    attemptedProviders,
    resolvedProvider: null,
    reason: attemptedProviders.at(-1)?.reason ?? "not_configured",
    priceDate: null,
    historyLength: null,
    momentum3MAvailable: false,
    momentum1YAvailable: false,
    betaAvailable: false,
    marketCapAvailable: false,
  };
}

const results = await Promise.all(SYMBOLS.map(probe));
console.log(JSON.stringify({ observedAt: new Date().toISOString(), providerChain: providerChain(), results }, null, 2));
if (results.every((result) => result.status !== "available")) process.exitCode = 1;
