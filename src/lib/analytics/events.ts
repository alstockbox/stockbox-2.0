import { createHash } from "node:crypto";
import { getServerEnv } from "@/lib/env/server";

export type AnalyticsEvent =
  | "homepage_view"
  | "pricing_view"
  | "sample_analysis_view"
  | "landing_view"
  | "cta_clicked"
  | "video_demo_opened"
  | "free_analysis_started"
  | "free_analysis_completed"
  | "free_analysis_failed"
  | "signup_started"
  | "signup_completed"
  | "login_completed"
  | "onboarding_completed"
  | "company_searched"
  | "analysis_started"
  | "analysis_completed"
  | "analysis_failed"
  | "portfolio_created"
  | "portfolio_analysis_started"
  | "portfolio_analysis_completed"
  | "portfolio_analysis_failed"
  | "portfolio_snapshot_created"
  | "provider_degraded"
  | "historical_coverage_partial"
  | "historical_valuation_unavailable"
  | "report_viewed"
  | "explain_clicked"
  | "company_followed"
  | "share_created"
  | "share_opened"
  | "paywall_viewed"
  | "pricing_plan_clicked"
  | "checkout_started"
  | "checkout_completed"
  | "comparison_started"
  | "comparison_completed"
  | "batch_started"
  | "batch_completed"
  | "affiliate_visit"
  | "subscription_started"
  | "subscription_cancelled"
  | "referral_shared"
  | "referral_signup"
  | "affiliate_conversion"
  | "streak_completed";

const allowedProperties: Record<AnalyticsEvent, readonly string[]> = {
  homepage_view: [], pricing_view: [], sample_analysis_view: [], landing_view: [],
  cta_clicked: ["cta", "location"],
  video_demo_opened: ["location"],
  free_analysis_started: [],
  free_analysis_completed: ["coverageBand"],
  free_analysis_failed: ["errorCode"],
  signup_started: [], signup_completed: [], login_completed: [],
  onboarding_completed: ["experience", "investmentProfile"],
  company_searched: ["queryLength", "resultCount"],
  analysis_started: ["ticker", "analysisType"],
  analysis_completed: ["ticker", "score", "researchView", "analysisType"],
  analysis_failed: ["ticker", "analysisType", "errorCode"],
  portfolio_created: [],
  portfolio_analysis_started: ["holdingCount"],
  portfolio_analysis_completed: ["holdingCount", "failedCount"],
  portfolio_analysis_failed: ["errorCode"],
  portfolio_snapshot_created: ["holdingCount", "failedCount"],
  provider_degraded: ["provider", "capability", "status"],
  historical_coverage_partial: ["ticker", "financialStatus", "financialYears", "priceStatus", "priceYears", "valuationStatus", "valuationYears", "dividendStatus", "dividendYears"],
  historical_valuation_unavailable: ["ticker", "valuationYears", "valuationObservations"],
  report_viewed: ["ticker"],
  explain_clicked: ["ticker", "dimension"],
  company_followed: ["ticker"],
  share_created: [], share_opened: [],
  paywall_viewed: ["analysisType", "plan"],
  pricing_plan_clicked: ["plan"],
  checkout_started: ["plan"], checkout_completed: ["plan"],
  comparison_started: ["count"], comparison_completed: ["count"],
  batch_started: ["count", "analysisType"],
  batch_completed: ["count", "completedCount", "failedCount"],
  affiliate_visit: [],
  subscription_started: ["plan"], subscription_cancelled: ["plan"],
  referral_shared: ["channel"], referral_signup: [], affiliate_conversion: ["plan"],
  streak_completed: ["streak"],
};

export const CLIENT_ANALYTICS_EVENTS = [
  "cta_clicked",
  "video_demo_opened",
  "portfolio_analysis_started",
  "portfolio_analysis_completed",
  "portfolio_analysis_failed",
  "pricing_plan_clicked",
  "batch_started",
  "batch_completed",
] as const;

export type ClientAnalyticsEvent = (typeof CLIENT_ANALYTICS_EVENTS)[number];

export function isClientAnalyticsEvent(value: unknown): value is ClientAnalyticsEvent {
  return typeof value === "string" && (CLIENT_ANALYTICS_EVENTS as readonly string[]).includes(value);
}

export function analyticsDistinctId(userId: unknown): string {
  if (typeof userId !== "string" || userId.length === 0) return "anonymous";
  const digest = createHash("sha256").update(`stockbox-analytics-v1:${userId}`).digest("hex");
  return `sb_${digest}`;
}

export function sanitizeAnalyticsProperties(event: AnalyticsEvent, properties: Record<string, unknown>): Record<string, string | number | boolean> {
  const result: Record<string, string | number | boolean> = {};
  for (const key of allowedProperties[event]) {
    const value = properties[key];
    if (typeof value === "string") result[key] = value.slice(0, 80);
    else if (typeof value === "boolean") result[key] = value;
    else if (typeof value === "number" && Number.isFinite(value)) result[key] = value;
  }
  return result;
}

export function captureServerEvent(event: AnalyticsEvent, properties: Record<string, unknown> = {}) {
  const env = getServerEnv();
  if (!env.NEXT_PUBLIC_POSTHOG_KEY) return;
  const distinctId = analyticsDistinctId(properties.userId);
  const safeProperties = sanitizeAnalyticsProperties(event, properties);
  void fetch(`${env.NEXT_PUBLIC_POSTHOG_HOST}/capture/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: env.NEXT_PUBLIC_POSTHOG_KEY, event, properties: { distinct_id: distinctId, ...safeProperties } }),
  }).catch(() => undefined);
}
