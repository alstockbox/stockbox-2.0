import { createHash } from "node:crypto";

export const ACQUISITION_EVENT_NAMES = [
  "page_view",
  "landing_page_view",
  "signup_completed",
  "analysis_completed",
  "pricing_view",
  "subscription_started",
] as const;

export type AcquisitionEventName = (typeof ACQUISITION_EVENT_NAMES)[number];

type NormalizedAcquisitionEvent = {
  event_id: string | null;
  idempotency_key: string;
  event_name: AcquisitionEventName;
  anonymous_id: string | null;
  user_id: string | null;
  session_id: string | null;
  campaign_id: string | null;
  content_id: string | null;
  creator_id: string | null;
  channel: string | null;
  source: string | null;
  medium: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  page: string | null;
  landing_page: string | null;
  referrer: string | null;
  language: string | null;
  properties: Record<string, unknown>;
  occurred_at: string;
};

type NormalizeResult =
  | { ok: true; value: NormalizedAcquisitionEvent }
  | { ok: false; error: "invalid_payload" | "invalid_event_name" | "missing_identity" | "invalid_timestamp" };

function text(value: unknown, max = 300): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized ? normalized.slice(0, max) : null;
}

function properties(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const source = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(source).slice(0, 30)) {
    const safeKey = key.slice(0, 80);
    if (typeof item === "string") result[safeKey] = item.slice(0, 300);
    else if (typeof item === "number" && Number.isFinite(item)) result[safeKey] = item;
    else if (typeof item === "boolean" || item === null) result[safeKey] = item;
  }
  return result;
}

export function isLikelyBot(userAgent: string | null | undefined): boolean {
  if (!userAgent) return false;
  return /(bot|crawler|spider|slurp|bingpreview|facebookexternalhit|headless|lighthouse|pagespeed|pingdom|uptimerobot)/i.test(userAgent);
}

export function normalizeAcquisitionPayload(payload: unknown, serverUserId?: string | null): NormalizeResult {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { ok: false, error: "invalid_payload" };
  }
  const raw = payload as Record<string, unknown>;
  const eventName = text(raw.event_name, 80);
  if (!eventName || !(ACQUISITION_EVENT_NAMES as readonly string[]).includes(eventName)) {
    return { ok: false, error: "invalid_event_name" };
  }

  const anonymousId = text(raw.anonymous_id, 160);
  const sessionId = text(raw.session_id, 160);
  const userId = serverUserId || text(raw.user_id, 160);
  if (!anonymousId && !sessionId && !userId) return { ok: false, error: "missing_identity" };

  const occurredRaw = text(raw.occurred_at, 80) ?? new Date().toISOString();
  const occurredTime = Date.parse(occurredRaw);
  if (!Number.isFinite(occurredTime)) return { ok: false, error: "invalid_timestamp" };
  const occurredAt = new Date(occurredTime).toISOString();

  const eventId = text(raw.event_id, 160);
  const signature = [eventName, userId || anonymousId || sessionId || "unknown", occurredAt, text(raw.page, 500) || ""].join("|");
  const idempotencyKey = eventId
    ? `evt:${eventId}`
    : `sig:${createHash("sha256").update(signature).digest("hex").slice(0, 40)}`;

  const utmSource = text(raw.utm_source, 160);
  const utmMedium = text(raw.utm_medium, 160);
  return {
    ok: true,
    value: {
      event_id: eventId,
      idempotency_key: idempotencyKey,
      event_name: eventName as AcquisitionEventName,
      anonymous_id: anonymousId,
      user_id: userId || null,
      session_id: sessionId,
      campaign_id: text(raw.campaign_id, 160),
      content_id: text(raw.content_id, 160),
      creator_id: text(raw.creator_id, 160),
      channel: text(raw.channel, 120) || utmSource,
      source: text(raw.source, 160) || utmSource,
      medium: text(raw.medium, 160) || utmMedium,
      utm_source: utmSource,
      utm_medium: utmMedium,
      utm_campaign: text(raw.utm_campaign, 200),
      utm_content: text(raw.utm_content, 200),
      utm_term: text(raw.utm_term, 200),
      page: text(raw.page, 500),
      landing_page: text(raw.landing_page, 800),
      referrer: text(raw.referrer, 800),
      language: text(raw.language, 40),
      properties: properties(raw.properties),
      occurred_at: occurredAt,
    },
  };
}
