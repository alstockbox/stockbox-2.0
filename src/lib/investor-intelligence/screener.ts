import type { AnalysisArchetype } from "@/lib/analysis/types";
import { readSnapshotMetric } from "./metrics";
import type { CompanyMetricSnapshot } from "./types";

export type MetricRange = { min?: number; max?: number };
export type ScreenerDefinition = {
  countries?: string[];
  exchanges?: string[];
  sectors?: string[];
  industries?: string[];
  archetypes?: AnalysisArchetype[];
  marketCap?: MetricRange;
  metricRanges?: Record<string, MetricRange>;
};

export type ScreenerCompany = {
  ticker: string;
  companyName: string;
  country: string | null;
  exchange: string | null;
  sector: string | null;
  industry: string | null;
  marketCap: number | null;
  archetype: AnalysisArchetype | null;
  snapshot: CompanyMetricSnapshot;
};

function includesNormalized(value: string | null, allowed?: string[]) {
  if (!allowed?.length) return true;
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return allowed.some((item) => item.trim().toLowerCase() === normalized);
}

function inRange(value: number | null, range?: MetricRange) {
  if (!range || (range.min === undefined && range.max === undefined)) return true;
  if (value === null || !Number.isFinite(value)) return false;
  if (range.min !== undefined && value < range.min) return false;
  if (range.max !== undefined && value > range.max) return false;
  return true;
}

export function matchesScreener(company: ScreenerCompany, definition: ScreenerDefinition) {
  if (!includesNormalized(company.country, definition.countries)) return false;
  if (!includesNormalized(company.exchange, definition.exchanges)) return false;
  if (!includesNormalized(company.sector, definition.sectors)) return false;
  if (!includesNormalized(company.industry, definition.industries)) return false;
  if (definition.archetypes?.length && (!company.archetype || !definition.archetypes.includes(company.archetype))) return false;
  if (!inRange(company.marketCap, definition.marketCap)) return false;
  for (const [metricKey, range] of Object.entries(definition.metricRanges ?? {})) {
    if (!inRange(readSnapshotMetric(company.snapshot, metricKey), range)) return false;
  }
  return true;
}

export function screenCompanies(companies: ScreenerCompany[], definition: ScreenerDefinition) {
  return companies.filter((company) => matchesScreener(company, definition));
}

export const SCREENER_PRESETS: Array<{ key: string; name: string; definition: ScreenerDefinition }> = [
  { key: "quality_compounders", name: "Quality Compounders", definition: { metricRanges: { score: { min: 75 }, "fundamentals.roic": { min: 0.15 }, "fundamentals.operatingMargin": { min: 0.15 }, "valuation.fcfYield": { min: 0.03 } } } },
  { key: "dividend_growth", name: "Dividend Growth", definition: { metricRanges: { "dividend.yield": { min: 0.015 }, "dividend.growth": { min: 0.03 }, "dividend.payoutRatio": { max: 0.75 } } } },
  { key: "cheap_quality", name: "Cheap Quality", definition: { metricRanges: { score: { min: 70 }, "dimensions.quality": { min: 70 }, "valuation.historicalPePercentile": { max: 0.35 } } } },
  { key: "garp", name: "Growth at Reasonable Price", definition: { metricRanges: { "fundamentals.revenueGrowth": { min: 0.08 }, "fundamentals.epsGrowth": { min: 0.08 }, "valuation.pe": { max: 30 }, score: { min: 65 } } } },
  { key: "high_roic", name: "High ROIC", definition: { metricRanges: { "fundamentals.roic": { min: 0.18 } } } },
  { key: "low_debt", name: "Low Debt", definition: { metricRanges: { "fundamentals.netDebtToEbitda": { max: 1.5 }, "dimensions.financialHealth": { min: 65 } } } },
  { key: "fcf_machines", name: "FCF Machines", definition: { metricRanges: { "valuation.fcfYield": { min: 0.05 }, "fundamentals.fcfMargin": { min: 0.12 }, "fundamentals.fcfGrowth": { min: 0 } } } },
  { key: "deep_value", name: "Deep Value", definition: { metricRanges: { "valuation.historicalPePercentile": { max: 0.2 }, "valuation.fcfYield": { min: 0.05 } } } },
  { key: "swedish_small_caps", name: "Swedish Small Caps", definition: { countries: ["SE"], marketCap: { max: 20_000_000_000 } } },
  { key: "quality_low_valuation", name: "High Quality / Low Valuation", definition: { metricRanges: { "dimensions.quality": { min: 75 }, "valuation.historicalPePercentile": { max: 0.4 }, score: { min: 70 } } } },
];
