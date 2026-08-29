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

const SAFE_ANALYTICS_KEYS = new Set([
  "ticker", "analysisType", "plan", "score", "recommendation",
  "resultCount", "section", "source", "streak", "days", "count",
]);
function analyticsDistinctId(userId: unknown) {
  if (typeof userId !== "string" || !userId.trim()) return "anonymous";
  return createHash("sha256").update(userId).digest("hex");
}

function sanitizeAnalyticsProperties(properties: Record<string, unknown>) {
  const sanitized: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (!SAFE_ANALYTICS_KEYS.has(key)) continue;
    if (typeof value === "string") sanitized[key] = value.slice(0, 80);
    else if (typeof value === "number" && Number.isFinite(value)) sanitized[key] = value;
    else if (typeof value === "boolean") sanitized[key] = value;
  }
  return sanitized;
}

export function captureServerEvent(
  event: AnalyticsEvent,
  properties: Record<string, unknown> = {}
) {
  const env = getServerEnv();
  if (!env.NEXT_PUBLIC_POSTHOG_KEY) return;

  const safeProperties = sanitizeAnalyticsProperties(properties);
  void fetch(`${env.NEXT_PUBLIC_POSTHOG_HOST}/capture/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },    body: JSON.stringify({
      api_key: env.NEXT_PUBLIC_POSTHOG_KEY,
      event,
      properties: {
        distinct_id: analyticsDistinctId(properties.userId),
        ...safeProperties,
      },
    }),
  }).catch(() => undefined);
}