"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

const CONSENT_COOKIE = "stockbox_analytics_consent";
const CONSENT_EVENT = "stockbox:analytics-consent";
const ANON_KEY = "stockbox_acq_anon_id";
const SESSION_KEY = "stockbox_acq_session_id";
const FIRST_TOUCH_KEY = "stockbox_acq_first_touch";

type Attribution = {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  creator_id?: string;
};

function consentAccepted() {
  if (typeof document === "undefined") return false;
  return document.cookie
    .split(";")
    .map((part) => part.trim())
    .some((part) => part === `${CONSENT_COOKIE}=accepted`);
}

function storageId(storage: Storage, key: string) {
  const existing = storage.getItem(key);
  if (existing) return existing;
  const value = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  storage.setItem(key, value);
  return value;
}

function currentAttribution(): Attribution {
  const params = new URLSearchParams(window.location.search);
  const direct: Attribution = {};
  for (const key of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "creator_id"] as const) {
    const value = params.get(key)?.slice(0, 200);
    if (value) direct[key] = value;
  }

  const hasCampaign = Object.keys(direct).length > 0;
  if (hasCampaign) {
    sessionStorage.setItem(FIRST_TOUCH_KEY, JSON.stringify(direct));
    return direct;
  }

  try {
    return JSON.parse(sessionStorage.getItem(FIRST_TOUCH_KEY) || "{}") as Attribution;
  } catch {
    return {};
  }
}

export function AcquisitionTracker() {
  const pathname = usePathname();
  const lastPageKey = useRef<string | null>(null);

  useEffect(() => {
    const capture = () => {
      if (!consentAccepted()) return;

      const pageKey = `${window.location.pathname}${window.location.search}`;
      if (lastPageKey.current === pageKey) return;
      lastPageKey.current = pageKey;

      const anonymousId = storageId(localStorage, ANON_KEY);
      const sessionId = storageId(sessionStorage, SESSION_KEY);
      const attribution = currentAttribution();
      const eventId = typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

      void fetch("/api/acquisition", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        keepalive: true,
        body: JSON.stringify({
          event_id: eventId,
          event_name: "page_view",
          anonymous_id: anonymousId,
          session_id: sessionId,
          occurred_at: new Date().toISOString(),
          page: window.location.pathname,
          landing_page: pageKey,
          referrer: document.referrer || null,
          language: navigator.language || null,
          campaign_id: attribution.utm_campaign || null,
          content_id: attribution.utm_content || null,
          creator_id: attribution.creator_id || null,
          channel: attribution.utm_source || null,
          source: attribution.utm_source || null,
          medium: attribution.utm_medium || null,
          ...attribution,
          properties: { title: document.title.slice(0, 200) },
        }),
      }).catch(() => undefined);
    };

    capture();
    window.addEventListener(CONSENT_EVENT, capture);
    return () => window.removeEventListener(CONSENT_EVENT, capture);
  }, [pathname]);

  return null;
}
