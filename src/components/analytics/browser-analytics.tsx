"use client";

import Script from "next/script";
import { useSyncExternalStore } from "react";
import type { Locale } from "@/lib/i18n/types";

const CONSENT_COOKIE = "stockbox_analytics_consent";
const CONSENT_EVENT = "stockbox:analytics-consent";
const ACCEPT_LABEL = "Accept analytics";
const REJECT_LABEL = "Reject analytics";

type ConsentState = "accepted" | "rejected" | null;

function readConsent(): ConsentState {
  if (typeof document === "undefined") return null;
  const value = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${CONSENT_COOKIE}=`))
    ?.split("=")[1];
  return value === "accepted" || value === "rejected" ? value : null;
}

function subscribeConsent(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(CONSENT_EVENT, onStoreChange);
  return () => window.removeEventListener(CONSENT_EVENT, onStoreChange);
}

function storeConsent(value: Exclude<ConsentState, null>) {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${CONSENT_COOKIE}=${value}; Max-Age=31536000; Path=/; SameSite=Lax${secure}`;
  window.dispatchEvent(new Event(CONSENT_EVENT));
}

export function BrowserAnalytics({
  gaId,
  metaPixelId,
  locale,
}: {
  gaId?: string;
  metaPixelId?: string;
  locale: Locale;
}) {
  const consent = useSyncExternalStore(subscribeConsent, readConsent, () => null);

  return (
    <>
      {consent === "accepted" && gaId ? (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(gaId)}`} strategy="afterInteractive" />
          <Script id="stockbox-ga4" strategy="afterInteractive">{`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', ${JSON.stringify(gaId)}, { anonymize_ip: true });
          `}</Script>
        </>
      ) : null}
      {consent === "accepted" && metaPixelId ? (
        <>
          <Script src="https://connect.facebook.net/en_US/fbevents.js" strategy="afterInteractive" />
          <Script id="stockbox-meta-pixel" strategy="afterInteractive">{`
            window.fbq = window.fbq || function(){window.fbq.callMethod ? window.fbq.callMethod.apply(window.fbq, arguments) : window.fbq.queue.push(arguments)};
            window.fbq.queue = window.fbq.queue || [];
            window.fbq.loaded = true;
            window.fbq.version = '2.0';
            window.fbq('init', ${JSON.stringify(metaPixelId)});
            window.fbq('track', 'PageView');
          `}</Script>
        </>
      ) : null}
      {consent === null ? (
        <div role="dialog" aria-label={locale === "sv" ? "Analyscookies" : "Analytics cookies"} className="fixed inset-x-3 bottom-3 z-[120] mx-auto max-w-2xl rounded-xl border border-white/15 bg-[#081321] p-4 shadow-2xl sm:inset-x-6">
          <p className="text-sm font-semibold text-[#f4efe5]">{locale === "sv" ? "Valfri produktanalys" : "Optional product analytics"}</p>
          <p className="mt-1 text-xs leading-5 text-[#9aa7b8]">
            {locale === "sv"
              ? "Om du samtycker kan StockBox använda valfri produktanalys för att mäta var besökare kommer ifrån och hur webbplatsen används. Google Analytics 4 och/eller Meta Pixel används också om de är konfigurerade. Nödvändiga konto-, betalnings- och säkerhetsfunktioner påverkas inte om du nekar."
              : "If you consent, StockBox may measure where visitors come from and how the website is used. Google Analytics 4 and/or Meta Pixel are also used when configured. Essential account, billing and security functions are unaffected if you reject analytics."}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => storeConsent("rejected")} className="min-h-11 rounded-md border border-white/15 px-4 text-sm font-semibold text-[#f4efe5] hover:bg-white/5">
              {locale === "sv" ? "Neka analyscookies" : REJECT_LABEL}
            </button>
            <button type="button" onClick={() => storeConsent("accepted")} className="min-h-11 rounded-md bg-[#b99b5f] px-4 text-sm font-semibold text-[#07111f] hover:bg-[#d0b579]">
              {locale === "sv" ? "Godkänn analyscookies" : ACCEPT_LABEL}
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
