import { createClient } from "@/lib/supabase/server";
import type { CompanyMetricSnapshot } from "./types";
import type { ScreenerCompany } from "./screener";
import { buildPeerComparison, selectComparablePeers } from "./peers";

function companyFromRow(row: Record<string, unknown>): ScreenerCompany | null {
  const snapshot = row.normalized as CompanyMetricSnapshot | null;
  if (!snapshot || typeof row.ticker !== "string") return null;
  return {
    ticker: row.ticker,
    companyName: typeof row.company_name === "string" ? row.company_name : snapshot.companyName,
    country: typeof row.country === "string" ? row.country : null,
    exchange: typeof row.exchange === "string" ? row.exchange : null,
    sector: typeof row.sector === "string" ? row.sector : null,
    industry: typeof row.industry === "string" ? row.industry : null,
    marketCap: row.market_cap === null || row.market_cap === undefined ? null : Number(row.market_cap),
    archetype: typeof row.archetype === "string" ? row.archetype as ScreenerCompany["archetype"] : null,
    snapshot,
  };
}

export async function getPeerIntelligence(ticker: string) {
  const supabase = await createClient();
  if (!supabase) return null;
  const { data: rows } = await supabase.from("company_latest_metrics")
    .select("ticker,company_name,country,exchange,sector,industry,market_cap,archetype,normalized")
    .limit(5000);
  const companies = (rows ?? []).map((row) => companyFromRow(row as Record<string, unknown>)).filter((row): row is ScreenerCompany => Boolean(row));
  const target = companies.find((company) => company.ticker === ticker);
  if (!target) return null;
  const { data: saved } = await supabase.from("peer_sets").select("peer_tickers,user_modified,methodology").eq("ticker", ticker).maybeSingle();
  const selected = saved?.peer_tickers?.length
    ? (saved.peer_tickers as string[]).map((peerTicker) => companies.find((company) => company.ticker === peerTicker)).filter((company): company is ScreenerCompany => Boolean(company))
    : selectComparablePeers(target, companies, 5);
  return {
    target,
    peers: selected,
    comparison: buildPeerComparison(target, selected),
    userModified: saved?.user_modified === true,
    methodology: saved?.methodology ?? { selection: "sector + archetype + market cap similarity; country as secondary signal" },
  };
}
