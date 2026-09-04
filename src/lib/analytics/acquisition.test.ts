import { describe, expect, it } from "vitest";
import { isLikelyBot, normalizeAcquisitionPayload } from "./acquisition";

describe("normalizeAcquisitionPayload", () => {
  it("accepts a page view and preserves attribution fields", () => {
    const result = normalizeAcquisitionPayload({
      event_id: "evt-123",
      event_name: "page_view",
      anonymous_id: "anon-123",
      session_id: "session-1",
      page: "/pricing",
      landing_page: "/pricing?utm_source=tiktok&utm_medium=organic_social",
      occurred_at: "2026-09-04T12:00:00.000Z",
      utm_source: "tiktok",
      utm_medium: "organic_social",
      utm_campaign: "launch",
      utm_content: "video-1",
      referrer: "https://www.tiktok.com/",
      language: "sv-SE",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.event_name).toBe("page_view");
    expect(result.value.utm_source).toBe("tiktok");
    expect(result.value.page).toBe("/pricing");
    expect(result.value.idempotency_key).toBe("evt:evt-123");
  });

  it("rejects unknown event names", () => {
    const result = normalizeAcquisitionPayload({
      event_name: "made_up_event",
      anonymous_id: "anon-123",
    });
    expect(result).toEqual({ ok: false, error: "invalid_event_name" });
  });

  it("requires an identity for page views", () => {
    const result = normalizeAcquisitionPayload({ event_name: "page_view" });
    expect(result).toEqual({ ok: false, error: "missing_identity" });
  });
});

describe("isLikelyBot", () => {
  it("detects common crawlers", () => {
    expect(isLikelyBot("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)")).toBe(true);
    expect(isLikelyBot("Mozilla/5.0 AppleWebKit Chrome/152 Safari/537.36")).toBe(false);
  });
});
