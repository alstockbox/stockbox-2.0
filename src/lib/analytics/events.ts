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

export function captureServerEvent(
  event: AnalyticsEvent,
  properties: Record<string, unknown> = {}
) {
  const env = getServerEnv();
  if (!env.NEXT_PUBLIC_POSTHOG_KEY) return;

  void fetch(`${env.NEXT_PUBLIC_POSTHOG_HOST}/capture/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: env.NEXT_PUBLIC_POSTHOG_KEY,
      event,
      properties: {
        distinct_id: properties.userId ?? "anonymous",
        ...properties
      }
    })
  }).catch(() => undefined);
}
import { getServerEnv } from "@/lib/env/server";
