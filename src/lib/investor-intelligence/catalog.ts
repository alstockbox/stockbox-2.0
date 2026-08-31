import type { AnalysisReport, CompanySearchResult } from "@/lib/analysis/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildCompanyMetricSnapshot } from "./snapshot";

export async function upsertCompanyMetricCatalog(input: {
  report: AnalysisReport;
  company?: CompanySearchResult | null;
}) {
  const supabase = createAdminClient();
  if (!supabase) return { ok: false as const, error: "supabase_not_configured" };
  const snapshot = buildCompanyMetricSnapshot(input.report);
  const sector = input.report.engine?.scores.sector ?? null;
  const marketCap = input.report.engine?.metrics.valuation.marketCap ?? input.report.market?.marketCap ?? null;
  const { error } = await supabase.from("company_latest_metrics").upsert({
    ticker: input.report.ticker,
    company_name: input.report.companyName,
    exchange: input.company?.exchange ?? input.company?.mic ?? null,
    country: input.company?.country ?? null,
    sector,
    industry: null,
    market_cap: marketCap,
    archetype: input.report.engine?.analysisArchetype ?? input.report.analysisArchetype ?? null,
    analysis_id: input.report.id || null,
    normalized: snapshot,
    updated_at: input.report.generatedAt,
  }, { onConflict: "ticker" });
  return error ? { ok: false as const, error: error.message } : { ok: true as const };
}
