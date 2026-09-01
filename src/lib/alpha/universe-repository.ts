import "server-only";

import { createAdminClient } from "../supabase/admin";
import {
  parseNasdaqTraderDirectory,
  type AlphaUniverseSecurity,
  type AlphaUniverseSource,
  type ParsedAlphaUniverse,
} from "./universe";

const NASDAQ_TRADER_URLS: Record<AlphaUniverseSource, string> = {
  nasdaq_listed: "https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt",
  other_listed: "https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt",
};

export type UniverseRefreshResult = {
  ok: boolean;
  source: "nasdaq_trader";
  datasets: Array<{
    dataset: AlphaUniverseSource;
    sourceAsOf: string | null;
    fetched: number;
    written: number;
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
  source: string;
  sourceKey: string;
  lastSeenAt: string;
  lastPredictionAt: string | null;
};

function universeRow(security: AlphaUniverseSecurity, observedAt: string) {
  return {
    source: security.source,
    source_key: security.sourceKey,
    ticker: security.ticker,
    company_name: security.name,
    exchange: security.exchange,
    country: security.country,
    currency: security.currency,
    security_type: "common_stock",
    eligible: security.eligible,
    first_seen_at: observedAt,
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
  const text = await response.text();
  return parseNasdaqTraderDirectory(text, dataset);
}

async function persistDataset(parsed: ParsedAlphaUniverse, observedAt: string): Promise<number> {
  const supabase = createAdminClient();
  if (!supabase) throw new Error("Supabase service role is not configured.");

  const rows = parsed.securities.map((security) => universeRow(security, observedAt));
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
      active: true,
    }))
    .filter((row): row is { universe_security_id: string; source_dataset: AlphaUniverseSource; source_as_of: string; active: true } => Boolean(row.universe_security_id));

  if (memberships.length) {
    const membershipWrite = await supabase
      .from("alpha_universe_memberships")
      .upsert(memberships, { onConflict: "universe_security_id,source_dataset,source_as_of", ignoreDuplicates: true });
    if (membershipWrite.error) throw new Error(`Universe membership write failed: ${membershipWrite.error.message}`);
  }

  // A security absent from the newest official dataset is no longer eligible for the current scanner,
  // but its historical identity and old prediction rows are retained.
  const existing = await supabase
    .from("alpha_universe_securities")
    .select("id,source_key")
    .eq("source", "nasdaq_trader")
    .like("source_key", `nasdaq_trader:${parsed.dataset}:%`);
  if (existing.error) throw new Error(`Universe reconciliation failed: ${existing.error.message}`);

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

  return rows.length;
}

export async function refreshOfficialUsUniverse(): Promise<UniverseRefreshResult> {
  const supabase = createAdminClient();
  if (!supabase) {
    return { ok: false, source: "nasdaq_trader", datasets: [], totalActive: 0 };
  }

  const datasets: UniverseRefreshResult["datasets"] = [];
  for (const dataset of ["nasdaq_listed", "other_listed"] as const) {
    const observedAt = new Date().toISOString();
    try {
      const parsed = await fetchDataset(dataset);
      const written = await persistDataset(parsed, observedAt);
      datasets.push({ dataset, sourceAsOf: parsed.sourceAsOf, fetched: parsed.securities.length, written });
    } catch (error) {
      datasets.push({
        dataset,
        sourceAsOf: null,
        fetched: 0,
        written: 0,
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
    datasets,
    totalActive: count.count ?? 0,
  };
}

export async function getUniverseCandidates(limit: number): Promise<AlphaUniverseCandidate[]> {
  const supabase = createAdminClient();
  if (!supabase) return [];
  const bounded = Math.min(250, Math.max(1, Math.floor(limit)));

  const securities = await supabase
    .from("alpha_universe_securities")
    .select("id,ticker,company_name,exchange,country,currency,source,source_key,last_seen_at")
    .eq("eligible", true)
    .order("last_seen_at", { ascending: false })
    .limit(Math.max(bounded * 8, 200));
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
      source: String(row.source),
      sourceKey: String(row.source_key),
      lastSeenAt: String(row.last_seen_at),
      lastPredictionAt: latestPrediction.get(String(row.id)) ?? null,
    }))
    .sort((left, right) => {
      if (!left.lastPredictionAt && right.lastPredictionAt) return -1;
      if (left.lastPredictionAt && !right.lastPredictionAt) return 1;
      if (!left.lastPredictionAt && !right.lastPredictionAt) return left.ticker.localeCompare(right.ticker);
      return left.lastPredictionAt!.localeCompare(right.lastPredictionAt!);
    })
    .slice(0, bounded);
}
