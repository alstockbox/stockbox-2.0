import { createClient } from "@/lib/supabase/server";
import { buildEarningsIntelligence } from "./earnings";
import { buildEstimateRevisionSummary, type EstimateSnapshotPoint } from "./estimates";

export async function getEarningsEstimateIntelligence(ticker: string) {
  const supabase = await createClient();
  if (!supabase) return { earnings: null, estimates: null };
  const [{ data: earningsRows }, { data: estimateRows }] = await Promise.all([
    supabase.from("earnings_events").select("id,fiscal_quarter,fiscal_year,event_date,reported_revenue,estimated_revenue,reported_eps,estimated_eps,operating_margin,free_cash_flow,source_provider,source_url,source_as_of").eq("ticker", ticker).order("event_date", { ascending: false }).limit(3),
    supabase.from("estimate_snapshots").select("captured_at,revenue_consensus,eps_consensus,target_price,analyst_count,high_estimate,low_estimate,source_provider,source_as_of").eq("ticker", ticker).order("captured_at", { ascending: true }).limit(100),
  ]);
  const latest = earningsRows?.[0];
  const prior = earningsRows?.[1];
  const earnings = latest ? {
    id: latest.id as string,
    fiscalQuarter: latest.fiscal_quarter as string | null,
    fiscalYear: latest.fiscal_year as number | null,
    eventDate: latest.event_date as string | null,
    reportedRevenue: latest.reported_revenue === null ? null : Number(latest.reported_revenue),
    estimatedRevenue: latest.estimated_revenue === null ? null : Number(latest.estimated_revenue),
    reportedEps: latest.reported_eps === null ? null : Number(latest.reported_eps),
    estimatedEps: latest.estimated_eps === null ? null : Number(latest.estimated_eps),
    operatingMargin: latest.operating_margin === null ? null : Number(latest.operating_margin),
    freeCashFlow: latest.free_cash_flow === null ? null : Number(latest.free_cash_flow),
    provider: latest.source_provider as string,
    sourceUrl: latest.source_url as string | null,
    sourceAsOf: latest.source_as_of as string | null,
    interpretation: buildEarningsIntelligence({
      reportedRevenue: latest.reported_revenue === null ? null : Number(latest.reported_revenue),
      estimatedRevenue: latest.estimated_revenue === null ? null : Number(latest.estimated_revenue),
      reportedEps: latest.reported_eps === null ? null : Number(latest.reported_eps),
      estimatedEps: latest.estimated_eps === null ? null : Number(latest.estimated_eps),
      operatingMargin: latest.operating_margin === null ? null : Number(latest.operating_margin),
      priorOperatingMargin: prior?.operating_margin === null || prior?.operating_margin === undefined ? null : Number(prior.operating_margin),
      freeCashFlow: latest.free_cash_flow === null ? null : Number(latest.free_cash_flow),
      priorFreeCashFlow: prior?.free_cash_flow === null || prior?.free_cash_flow === undefined ? null : Number(prior.free_cash_flow),
    }),
  } : null;
  const estimatePoints: EstimateSnapshotPoint[] = (estimateRows ?? []).map((row) => ({
    capturedAt: row.captured_at as string,
    revenueConsensus: row.revenue_consensus === null ? null : Number(row.revenue_consensus),
    epsConsensus: row.eps_consensus === null ? null : Number(row.eps_consensus),
    targetPrice: row.target_price === null ? null : Number(row.target_price),
    analystCount: row.analyst_count === null ? null : Number(row.analyst_count),
    highEstimate: row.high_estimate === null ? null : Number(row.high_estimate),
    lowEstimate: row.low_estimate === null ? null : Number(row.low_estimate),
  }));
  return { earnings, estimates: estimatePoints.length ? buildEstimateRevisionSummary(estimatePoints) : null };
}
