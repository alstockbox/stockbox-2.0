import { resolveCanonicalCompanySelection } from "@/lib/data/company-search";
import { fetchOfficialResearchBundle } from "@/lib/data/official-research";
import { searchCompanies } from "@/lib/data/provider";
import { createAdminClient } from "@/lib/supabase/admin";
import { deriveOfficialMonitoringSignals, type MonitoringSignal } from "./official-signals";

type WatchlistRow = {
  id: string;
  user_id: string;
  ticker: string;
  company_name: string;
  alert_preferences: Record<string, unknown> | null;
  monitoring_enabled: boolean;
  monitoring_frequency: "daily" | "weekly";
};

export type MonitoringRunResult = {
  checked: number;
  baselined: number;
  changed: number;
  notified: number;
  failed: number;
};

function nextCheckIso(now: Date, frequency: WatchlistRow["monitoring_frequency"]): string {
  const hours = frequency === "weekly" ? 7 * 24 : 24;
  return new Date(now.getTime() + hours * 60 * 60 * 1_000).toISOString();
}

function alertEnabled(preferences: Record<string, unknown> | null, signal: MonitoringSignal): boolean {
  const key = signal.kind === "short_interest" ? "shortInterest" : signal.kind;
  const value = preferences?.[key];
  return value === undefined ? true : value === true;
}

function sourceMetadata(signal: MonitoringSignal) {
  return signal.sources.map((source) => ({
    name: source.name,
    url: source.url,
    provider: source.provider ?? null,
    dataAsOf: source.dataAsOf ?? null,
    accessedAt: source.accessedAt,
  }));
}

async function processWatchlistItem(row: WatchlistRow, now: Date): Promise<{ baselined: number; changed: number; notified: number }> {
  const admin = createAdminClient();
  if (!admin) throw new Error("Supabase admin client is unavailable.");

  const candidates = await searchCompanies(row.ticker);
  const resolution = resolveCanonicalCompanySelection(
    { ticker: row.ticker, canonicalTicker: row.ticker, name: row.company_name },
    candidates,
  );
  if (!resolution.ok) throw new Error("Canonical company identity could not be resolved for monitoring.");

  const bundle = await fetchOfficialResearchBundle(resolution.company, { deepResearch: true });
  const signals = deriveOfficialMonitoringSignals(bundle);
  let baselined = 0;
  let changed = 0;
  let notified = 0;

  for (const signal of signals) {
    const { data: existing } = await admin
      .from("monitoring_snapshots")
      .select("signal_hash")
      .eq("watchlist_id", row.id)
      .eq("signal_kind", signal.kind)
      .maybeSingle();

    const previousHash = (existing as { signal_hash?: string } | null)?.signal_hash ?? null;
    const isChanged = previousHash !== null && previousHash !== signal.hash;
    const isBaseline = previousHash === null;

    await admin.from("monitoring_snapshots").upsert({
      watchlist_id: row.id,
      user_id: row.user_id,
      ticker: row.ticker,
      signal_kind: signal.kind,
      signal_hash: signal.hash,
      data_as_of: signal.dataAsOf,
      payload: signal.payload,
      source_metadata: sourceMetadata(signal),
      updated_at: now.toISOString(),
    }, { onConflict: "watchlist_id,signal_kind" });

    if (isBaseline) baselined += 1;
    if (!isChanged) continue;
    changed += 1;
    if (!alertEnabled(row.alert_preferences, signal)) continue;

    const { data: insertedEvent, error: eventError } = await admin
      .from("monitoring_events")
      .insert({
        watchlist_id: row.id,
        user_id: row.user_id,
        ticker: row.ticker,
        signal_kind: signal.kind,
        severity: signal.severity,
        signal_hash: signal.hash,
        title: signal.title,
        body: signal.body,
        data_as_of: signal.dataAsOf,
        source_metadata: sourceMetadata(signal),
      })
      .select("id")
      .maybeSingle();

    if (eventError || !insertedEvent) continue;
    await admin.from("notifications").insert({
      user_id: row.user_id,
      kind: `watchlist_${signal.kind}`,
      title: signal.title,
      body: signal.body,
      metadata: {
        ticker: row.ticker,
        watchlistId: row.id,
        monitoringEventId: (insertedEvent as { id: string }).id,
        severity: signal.severity,
        dataAsOf: signal.dataAsOf,
        sources: sourceMetadata(signal),
      },
    });
    notified += 1;
  }

  await admin.from("watchlists").update({
    last_checked_at: now.toISOString(),
    next_check_at: nextCheckIso(now, row.monitoring_frequency),
    last_monitor_error: null,
  }).eq("id", row.id);

  return { baselined, changed, notified };
}

export async function runOfficialWatchlistMonitoring(options: { limit?: number; now?: Date } = {}): Promise<MonitoringRunResult> {
  const admin = createAdminClient();
  if (!admin) throw new Error("Supabase admin client is unavailable.");
  const now = options.now ?? new Date();
  const limit = Math.max(1, Math.min(options.limit ?? 20, 100));
  const { data, error } = await admin
    .from("watchlists")
    .select("id,user_id,ticker,company_name,alert_preferences,monitoring_enabled,monitoring_frequency")
    .eq("monitoring_enabled", true)
    .lte("next_check_at", now.toISOString())
    .order("next_check_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(`Unable to load due watchlist monitors: ${error.message}`);

  const result: MonitoringRunResult = { checked: 0, baselined: 0, changed: 0, notified: 0, failed: 0 };
  for (const row of (data ?? []) as WatchlistRow[]) {
    try {
      const item = await processWatchlistItem(row, now);
      result.checked += 1;
      result.baselined += item.baselined;
      result.changed += item.changed;
      result.notified += item.notified;
    } catch (error) {
      result.failed += 1;
      const message = error instanceof Error ? error.message.slice(0, 500) : "Unknown monitoring failure";
      await admin.from("watchlists").update({
        last_checked_at: now.toISOString(),
        next_check_at: nextCheckIso(now, row.monitoring_frequency),
        last_monitor_error: message,
      }).eq("id", row.id);
    }
  }
  return result;
}
