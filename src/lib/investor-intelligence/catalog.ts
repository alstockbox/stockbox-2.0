import type { AnalysisReport, CompanySearchResult } from "@/lib/analysis/types";
import { resolveCanonicalCompanySelection } from "@/lib/data/company-search";
import { searchCompanies } from "@/lib/data/provider";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildCompanyMetricSnapshot } from "./snapshot";
import type { CompanyMetricSnapshot, PublicCompanyMetricSnapshot } from "./types";

async function resolveMetadata(report: AnalysisReport, supplied?: CompanySearchResult | null) {
  if (supplied) return supplied;
  try {
    const candidates = await searchCompanies(report.ticker);
    const resolution = resolveCanonicalCompanySelection({
      ticker: report.ticker,
      canonicalTicker: report.ticker,
      name: report.companyName,
    }, candidates);
    return resolution.ok ? resolution.company : null;
  } catch {
    return null;
  }
}

function toPublicCompanySnapshot(snapshot: CompanyMetricSnapshot): PublicCompanyMetricSnapshot {
  return {
    ticker: snapshot.ticker,
    companyName: snapshot.companyName,
    capturedAt: snapshot.capturedAt,
    price: snapshot.price,
    priceChange1d: snapshot.priceChange1d,
    score: snapshot.score,
    confidence: snapshot.confidence,
    coverage: snapshot.coverage,
    fairValue: snapshot.fairValue,
    fairValueLow: snapshot.fairValueLow,
    fairValueHigh: snapshot.fairValueHigh,
    fairValueUpside: snapshot.fairValueUpside,
    archetype: snapshot.archetype,
    valuation: snapshot.valuation,
    fundamentals: snapshot.fundamentals,
    dividend: snapshot.dividend,
    estimates: snapshot.estimates,
    dimensions: snapshot.dimensions,
    riskFlags: snapshot.riskFlags,
  };
}

export async function upsertCompanyMetricCatalog(input: {
  report: AnalysisReport;
  company?: CompanySearchResult | null;
}) {
  const supabase = createAdminClient();
  if (!supabase) return { ok: false as const, error: "supabase_not_configured" };
  const snapshot = toPublicCompanySnapshot(buildCompanyMetricSnapshot(input.report));
  const company = await resolveMetadata(input.report, input.company);
  const sector = input.report.engine?.scores.sector ?? null;
  const marketCap = input.report.engine?.metrics.valuation.marketCap ?? input.report.market?.marketCap ?? null;
  const { error } = await supabase.from("company_latest_metrics").upsert({
    ticker: input.report.ticker,
    company_name: input.report.companyName,
    exchange: company?.exchange ?? company?.mic ?? null,
    country: company?.country ?? null,
    currency: company?.currency ?? input.report.market?.currency ?? input.report.reportingCurrency ?? null,
    sector,
    industry: null,
    market_cap: marketCap,
    archetype: input.report.engine?.analysisArchetype ?? input.report.analysisArchetype ?? null,
    normalized: snapshot,
    updated_at: input.report.generatedAt,
  }, { onConflict: "ticker" });
  return error ? { ok: false as const, error: error.message } : { ok: true as const };
}
