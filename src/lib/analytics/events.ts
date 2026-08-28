import { createHash } from "node:crypto";
import { getServerEnv } from "@/lib/env/server";

export type AnalyticsEvent =
  | "landing_view"
  | "signup_started"
  | "signup_completed"
  | "onboarding_completed"
  | "company_searched"
  | "analysis_started"
  | "analysis_completed"
  | "analysis_failed"
  | "report_viewed"
  | "explain_clicked"
  | "company_followed"
  | "share_created"
  | "share_opened"
  | "paywall_viewed"
  | "checkout_started"
  | "subscription_started"
  | "subscription_cancelled"
  | "referral_shared"
  | "referral_signup"
  | "affiliate_conversion"
  | "streak_completed";

const allowedProperties: Record<AnalyticsEvent, readonly string[]> = {
  landing_view: [],
  signup_started: [],
  signup_completed: [],
  onboarding_completed: ["experience", "investmentProfile"],
  company_searched: ["queryLength", "resultCount"],
  analysis_started: ["ticker", "analysisType"],
  analysis_completed: ["ticker", "score", "recommendation", "analysisType"],
  analysis_failed: ["ticker", "analysisType", "errorCode"],
  report_viewed: ["ticker"],
  explain_clicked: ["ticker", "dimension"],
  company_followed: ["ticker"],
  share_created: [],
  share_opened: [],
  paywall_viewed: ["analysisType", "plan"],
  checkout_started: ["plan"],
  subscription_started: ["plan"],
  subscription_cancelled: ["plan"],
  referral_shared: ["channel"],
  referral_signup: [],
  affiliate_conversion: [],
  streak_completed: ["streak"],
};

export function analyticsDistinctId(userId: unknown): string {
  if (typeof userId !== "string" || userId.length === 0) return "anonymous";
  const digest = createHash("sha256").update(`stockbox-analytics-v1:${userId}`).digest("hex");
  return `sb_${digest}`;
}
export function sanitizeAnalyticsProperties(
  event: AnalyticsEvent,
  properties: Record<string, unknown>
): Record<string, string | number | boolean> {
  const result: Record<string, string | number | boolean> = {};
  for (const key of allowedProperties[event]) {
    const value = properties[key];
    if (typeof value === "string") result[key] = value.slice(0, 80);
    else if (typeof value === "boolean") result[key] = value;
    else if (typeof value === "number" && Number.isFinite(value)) result[key] = value;
  }
  return result;
}

export function captureServerEvent(
  event: AnalyticsEvent,
  properties: Record<string, unknown> = {}
) {
  const env = getServerEnv();
  if (!env.NEXT_PUBLIC_POSTHOG_KEY) return;

  const distinctId = analyticsDistinctId(properties.userId);
  const safeProperties = sanitizeAnalyticsProperties(event, properties);
  void fetch(`${env.NEXT_PUBLIC_POSTHOG_HOST}/capture/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: env.NEXT_PUBLIC_POSTHOG_KEY,
      event,
      properties: {
        distinct_id: distinctId,
        ...safeProperties,
      },
    }),
  }).catch(() => undefined);
}
