import "server-only";

import { getSecUserAgent } from "../env/server";
import { createAdminClient } from "../supabase/admin";
import {
  parseNasdaqTraderDirectory,
  parseSecTickerExchangeDirectory,
  type AlphaUniverseSecurity,
  type AlphaUniverseSource,
  type ParsedAlphaUniverse,
  type SecTickerIdentity,
} from "./universe";

const NASDAQ_TRADER_URLS: Record<AlphaUniverseSource, string> = {
  nasdaq_listed: "https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt",
  other_listed: "https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt",
};
const SEC_TICKER_EXCHANGE_URL = "https://www.sec.gov/files/company_tickers_exchange.json";

export type UniverseRefreshResult = {
  ok: boolean;
  source: "nasdaq_trader";
  identityEnrichment: "sec" | "unavailable";
  datasets: Array<{
    dataset: AlphaUniverseSource;
    sourceTimestampRaw: string | null;
    fetched: number;
    written: number;
    cikEnriched: number;
    error?: string;
  }>;
  totalActive: number;
};

export type AlphaUniverseCandidate = {
  id: string;
  ticker: string;
  companyName: string;
  exchange: string | null;
  country: string | null;
  currency: string | null;
  cik: string | null;
  source: string;
  sourceKey: string;
  lastSeenAt: string;
  lastPredictionAt: string | null;
};

function universeRow(
  security: AlphaUniverseSecurity,
  observedAt: string,
  firstSeenAt: string,
  identity: SecTickerIdentity | undefined,
) {
  return {
    source: security.source,
    source_key: security.sourceKey,
    ticker: security.ticker,
    company_name: security.name,
    exchange: security.exchange,
    country: security.country,
    currency: security.currency,
    cik: identity?.cik ?? null,
    security_type: "common_stock",
    eligible: security.eligible,
    first_seen_at: firstSeenAt,
    last_seen_at: observedAt,
    updated_at: observedAt,
  };
}

async function fetchDataset(dataset: AlphaUniverseSource): Promise<ParsedAlphaUniverse> {
  const response = await fetch(NASDAQ_TRADER_URLS[dataset], {
    cache: "no-store",
    headers: { "User-Agent": "StockBox Alpha Universe/1.0" },
  });
  if (!response.ok) throw new Error(`Nasdaq Trader ${dataset} returned HTTP ${response.status}.`);
  return parseNasdaqTraderDirectory(await response.text(), dataset);
}

async function fetchSecIdentities(): Promise<Map<string, SecTickerIdentity> | null> {
  const userAgent = getSecUserAgent();
  if (!userAgent) return null;
  try {
    const response = await fetch(SEC_TICKER_EXCHANGE_URL, {
      cache: "no-store",
      headers: {
        "User-Agent": userAgent,
        Accept: "application/json",
      },
    });
    if (!response.ok) return null;
    return parseSecTickerExchangeDirectory(await response.json());
  } catch {
    return null;
  }
}

async function persistDataset(
  parsed: ParsedAlphaUniverse,
  observedAt: string,
  identities: Map<string, SecTickerIdentity> | null,
): Promise<{ written: number; cikEnriched: number }> {
  const supabase = createAdminClient();
  if (!supabase) throw new Error("Supabase service role is not configured.");

  const existing = await supabase
    .from("alpha_universe_securities")
    .select("id,source_key,first_seen_at")
    .eq("source", "nasdaq_trader")
    .like("source_key", `nasdaq_trader:${parsed.dataset}:%`);
  if (existing.error) throw new Error(`Universe reconciliation failed: ${existing.error.message}`);

  const firstSeenByKey = new Map((existing.data ?? []).map((row) => [String(row.source_key), String(row.first_seen_at)]));
  const rows = parsed.securities.map((security) => universeRow(
    security,
    observedAt,
    firstSeenByKey.get(security.sourceKey) ?? observedAt,
    identities?.get(security.ticker),
  ));
  if (!rows.length) throw new Error(`Nasdaq Trader ${parsed.dataset} produced no eligible securities.`);

  const upsert = await supabase
    .from("alpha_universe_securities")
    .upsert(rows, { onConflict: "source,source_key", ignoreDuplicates: false })
    .select("id,source_key");
  if (upsert.error) throw new Error(`Universe upsert failed: ${upsert.error.message}`);

  const sourceKeys = new Set(parsed.securities.map((security) => security.sourceKey));
  const idsByKey = new Map((upsert.data ?? []).map((row) => [String(row.source_key), String(row.id)]));
  const memberships = parsed.securities
    .map((security) => ({
      universe_security_id: idsByKey.get(security.sourceKey),
      source_dataset: parsed.dataset,
      source_as_of: observedAt,
      source_timestamp_raw: parsed.sourceTimestampRaw,
      active: true,
    }))
    .filter((row): row is {
      universe_security_id: string;
      source_dataset: AlphaUniverseSource;
      source_as_of: string;
      source_timestamp_raw: string;
      active: true;
    } => Boolean(row.universe_security_id));

  if (memberships.length) {
    const membershipWrite = await supabase
      .from("alpha_universe_memberships")
      .upsert(memberships, { onConflict: "universe_security_id,source_dataset,source_as_of", ignoreDuplicates: true });
    if (membershipWrite.error) throw new Error(`Universe membership write failed: ${membershipWrite.error.message}`);
  }

  const inactiveIds = (existing.data ?? [])
    .filter((row) => !sourceKeys.has(String(row.source_key)))
    .map((row) => String(row.id));
  if (inactiveIds.length) {
    const deactivate = await supabase
      .from("alpha_universe_securities")
      .update({ eligible: false, updated_at: observedAt })
      .in("id", inactiveIds);
    if (deactivate.error) throw new Error(`Universe deactivation failed: ${deactivate.error.message}`);
  }

  return {
    written: rows.length,
    cikEnriched: rows.filter((row) => Boolean(row.cik)).length,
  };
}

export async function refreshOfficialUsUniverse(): Promise<UniverseRefreshResult> {
  const supabase = createAdminClient();
  if (!supabase) {
    return { ok: false, source: "nasdaq_trader", identityEnrichment: "unavailable", datasets: [], totalActive: 0 };
  }

  const identities = await fetchSecIdentities();
  const datasets: UniverseRefreshResult["datasets"] = [];
  for (const dataset of ["nasdaq_listed", "other_listed"] as const) {
    const observedAt = new Date().toISOString();
    try {
      const parsed = await fetchDataset(dataset);
      const persisted = await persistDataset(parsed, observedAt, identities);
      datasets.push({
        dataset,
        sourceTimestampRaw: parsed.sourceTimestampRaw,
        fetched: parsed.securities.length,
        written: persisted.written,
        cikEnriched: persisted.cikEnriched,
      });
    } catch (error) {
      datasets.push({
        dataset,
        sourceTimestampRaw: null,
        fetched: 0,
        written: 0,
        cikEnriched: 0,
        error: error instanceof Error ? error.message : "Unknown universe refresh failure.",
      });
    }
  }

  const count = await supabase
    .from("alpha_universe_securities")
    .select("id", { count: "exact", head: true })
    .eq("source", "nasdaq_trader")
    .eq("eligible", true);

  return {
    ok: datasets.every((dataset) => !dataset.error),
    source: "nasdaq_trader",
    identityEnrichment: identities ? "sec" : "unavailable",
    datasets,
    totalActive: count.count ?? 0,
  };
}

export async function getUniverseCandidates(limit: number): Promise<AlphaUniverseCandidate[]> {
  const supabase = createAdminClient();
  if (!supabase) return [];
  const bounded = Math.min(500, Math.max(1, Math.floor(limit)));

  const securities = await supabase
    .from("alpha_universe_securities")
    .select("id,ticker,company_name,exchange,country,currency,cik,source,source_key,last_seen_at")
    .eq("eligible", true)
    .order("last_seen_at", { ascending: false })
    .limit(Math.max(bounded * 8, 500));
  if (securities.error || !securities.data?.length) return [];

  const securityIds = securities.data.map((row) => String(row.id));
  const predictions = await supabase
    .from("alpha_predictions")
    .select("universe_security_id,prediction_as_of")
    .in("universe_security_id", securityIds)
    .order("prediction_as_of", { ascending: false });

  const latestPrediction = new Map<string, string>();
  for (const row of predictions.data ?? []) {
    const id = row.universe_security_id ? String(row.universe_security_id) : null;
    if (id && !latestPrediction.has(id)) latestPrediction.set(id, String(row.prediction_as_of));
  }

  return securities.data
    .map((row) => ({
      id: String(row.id),
      ticker: String(row.ticker),
      companyName: String(row.company_name),
      exchange: row.exchange ? String(row.exchange) : null,
      country: row.country ? String(row.country) : null,
      currency: row.currency ? String(row.currency) : null,
      cik: row.cik ? String(row.cik) : null,
      source: String(row.source),
      sourceKey: String(row.source_key),
      lastSeenAt: String(row.last_seen_at),
      lastPredictionAt: latestPrediction.get(String(row.id)) ?? null,
    }))
    .sort((left, right) => {
      if (!left.lastPredictionAt && right.lastPredictionAt) return -1;
      if (left.lastPredictionAt && !right.lastPredictionAt) return 1;
      if (!left.lastPredictionAt && !right.lastPredictionAt) {
        if (Boolean(left.cik) !== Boolean(right.cik)) return left.cik ? -1 : 1;
        return left.ticker.localeCompare(right.ticker);
      }
      return left.lastPredictionAt!.localeCompare(right.lastPredictionAt!) || left.ticker.localeCompare(right.ticker);
    })
    .slice(0, bounded);
}
