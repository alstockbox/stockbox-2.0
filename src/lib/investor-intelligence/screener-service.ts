import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { AnalysisArchetype } from "@/lib/analysis/types";
import type { PublicCompanyMetricSnapshot } from "./types";
import { screenCompanies, type ScreenerCompany, type ScreenerDefinition } from "./screener";

function toCompany(row: Record<string, unknown>): ScreenerCompany | null {
  const normalized = row.normalized as PublicCompanyMetricSnapshot | null;
  if (!normalized || typeof row.ticker !== "string") return null;
  return {
    ticker: row.ticker,
    companyName: typeof row.company_name === "string" ? row.company_name : normalized.companyName,
    exchange: typeof row.exchange === "string" ? row.exchange : null,
    country: typeof row.country === "string" ? row.country : null,
    sector: typeof row.sector === "string" ? row.sector : null,
    industry: typeof row.industry === "string" ? row.industry : null,
    marketCap: typeof row.market_cap === "number" ? row.market_cap : row.market_cap === null ? null : Number(row.market_cap),
    archetype: typeof row.archetype === "string" ? row.archetype as AnalysisArchetype : null,
    snapshot: normalized,
  };
}

export async function getScreenerUniverse(limit = 5000) {
  const supabase = await createClient();
  if (!supabase) return [];
  const { data } = await supabase.from("company_latest_metrics")
    .select("ticker,company_name,exchange,country,sector,industry,market_cap,archetype,normalized,updated_at")
    .order("updated_at", { ascending: false })
    .limit(Math.max(1, Math.min(limit, 10_000)));
  return (data ?? []).map((row) => toCompany(row as Record<string, unknown>)).filter((row): row is ScreenerCompany => Boolean(row));
}

export async function runScreener(definition: ScreenerDefinition, limit = 5000) {
  return screenCompanies(await getScreenerUniverse(limit), definition);
}

export async function getSavedScreeners() {
  const supabase = await createClient();
  if (!supabase) return [];
  const { data } = await supabase.from("saved_screeners")
    .select("id,name,filters,notification_preference,last_run_at,created_at")
    .order("updated_at", { ascending: false });
  return (data ?? []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    filters: row.filters as ScreenerDefinition,
    notificationPreference: row.notification_preference as string,
    lastRunAt: row.last_run_at as string | null,
    createdAt: row.created_at as string,
  }));
}

async function adminUniverse() {
  const supabase = createAdminClient();
  if (!supabase) return [];
  const { data } = await supabase.from("company_latest_metrics")
    .select("ticker,company_name,exchange,country,sector,industry,market_cap,archetype,normalized")
    .limit(10_000);
  return (data ?? []).map((row) => toCompany(row as Record<string, unknown>)).filter((row): row is ScreenerCompany => Boolean(row));
}

export async function runSavedScreener(input: { userId: string; screenerId: string; universe?: ScreenerCompany[] }) {
  const supabase = createAdminClient();
  if (!supabase) return { ok: false as const, error: "supabase_not_configured" };
  const { data: screener, error } = await supabase.from("saved_screeners")
    .select("id,name,filters,notification_preference")
    .eq("id", input.screenerId).eq("user_id", input.userId).maybeSingle();
  if (error || !screener) return { ok: false as const, error: error?.message ?? "screener_not_found" };
  const universe = input.universe ?? await adminUniverse();
  const matches = screenCompanies(universe, screener.filters as ScreenerDefinition).map((item) => item.ticker).sort();
  const { data: previous } = await supabase.from("screener_snapshots")
    .select("matched_tickers").eq("saved_screener_id", screener.id).eq("user_id", input.userId)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  const prior = new Set<string>((previous?.matched_tickers ?? []) as string[]);
  const current = new Set(matches);
  const entered = matches.filter((ticker) => !prior.has(ticker));
  const left = [...prior].filter((ticker) => !current.has(ticker)).sort();
  const { error: snapshotError } = await supabase.from("screener_snapshots").insert({
    user_id: input.userId, saved_screener_id: screener.id, matched_tickers: matches, entered_tickers: entered, left_tickers: left,
  });
  if (snapshotError) return { ok: false as const, error: snapshotError.message };
  await supabase.from("saved_screeners").update({ last_run_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", screener.id).eq("user_id", input.userId);
  if (entered.length && screener.notification_preference !== "none") {
    await supabase.from("notifications").insert({
      user_id: input.userId,
      kind: "screener_match",
      title: `${entered.length} new ${entered.length === 1 ? "company" : "companies"} match ${screener.name}`,
      body: entered.slice(0, 8).join(", ") + (entered.length > 8 ? ` +${entered.length - 8} more` : ""),
      metadata: { screenerId: screener.id, enteredTickers: entered, matchCount: matches.length },
    });
  }
  return { ok: true as const, matches, entered, left };
}

export async function runAllSavedScreeners(limit = 1000) {
  const supabase = createAdminClient();
  if (!supabase) return { ok: false as const, processed: 0, failed: 0, error: "supabase_not_configured" };
  const [{ data: screeners }, universe] = await Promise.all([
    supabase.from("saved_screeners").select("id,user_id").limit(limit),
    adminUniverse(),
  ]);
  let processed = 0, failed = 0;
  for (const row of screeners ?? []) {
    const result = await runSavedScreener({ userId: row.user_id, screenerId: row.id, universe });
    processed += 1;
    if (!result.ok) failed += 1;
  }
  return { ok: failed === 0, processed, failed };
}
