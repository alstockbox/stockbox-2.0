"use client";

import type { ClientAnalyticsEvent } from "@/lib/analytics/events";

export function captureClientEvent(
  event: ClientAnalyticsEvent,
  properties: Record<string, string | number | boolean> = {},
) {
  void fetch("/api/analytics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event, properties }),
    keepalive: true,
  }).catch(() => undefined);
}
