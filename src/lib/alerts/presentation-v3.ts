import type { AnalysisAlertEventKindV3, AnalysisAlertSeverityV3 } from "./analysis-alerts-v3";

export type StoredAnalysisAlertEventV3 = {
  ticker: string;
  alert_kind: AnalysisAlertEventKindV3;
  severity: AnalysisAlertSeverityV3;
  message_key: string;
  payload: Record<string, unknown> | null;
  observed_at: string;
};

export type PresentedAnalysisAlertV3 = {
  kindLabel: string;
  title: string;
  body: string;
};

type AlertLocale = "sv" | "en";

const ratingLabels: Record<AlertLocale, Record<string, string>> = {
  sv: {
    STRONG_BUY: "STARKT KÖP",
    BUY: "KÖP",
    WAIT: "AVVAKTA",
    HOLD: "BEHÅLL",
    REDUCE: "MINSKA",
    SELL: "SÄLJ",
    UNAVAILABLE: "EJ BEDÖMBAR",
  },
  en: {
    STRONG_BUY: "STRONG BUY",
    BUY: "BUY",
    WAIT: "WAIT",
    HOLD: "HOLD",
    REDUCE: "REDUCE",
    SELL: "SELL",
    UNAVAILABLE: "UNAVAILABLE",
  },
};

const kindLabels: Record<AlertLocale, Record<AnalysisAlertEventKindV3, string>> = {
  sv: {
    RECOMMENDATION_CHANGE: "Ratingändring",
    CONVICTION_DROP: "Lägre övertygelse",
    DATA_QUALITY_DROP: "Datakvalitet",
    PRICE_ABOVE: "Prisgräns uppåt",
    PRICE_BELOW: "Prisgräns nedåt",
  },
  en: {
    RECOMMENDATION_CHANGE: "Rating change",
    CONVICTION_DROP: "Lower conviction",
    DATA_QUALITY_DROP: "Data quality",
    PRICE_ABOVE: "Price threshold above",
    PRICE_BELOW: "Price threshold below",
  },
};

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberLabel(value: unknown, locale: AlertLocale, maximumFractionDigits = 1): string {
  const numeric = finite(value);
  if (numeric === null) return locale === "sv" ? "okänt" : "unknown";
  return new Intl.NumberFormat(locale === "sv" ? "sv-SE" : "en-GB", { maximumFractionDigits }).format(numeric);
}

function ratingLabel(value: unknown, locale: AlertLocale): string {
  const normalized = text(value)?.toUpperCase() ?? "UNAVAILABLE";
  return ratingLabels[locale][normalized] ?? ratingLabels[locale].UNAVAILABLE;
}

export function presentAnalysisAlertEventV3(
  event: StoredAnalysisAlertEventV3,
  locale: string,
): PresentedAnalysisAlertV3 {
  const language: AlertLocale = locale === "sv" ? "sv" : "en";
  const payload = event.payload ?? {};
  const ticker = event.ticker.trim().toUpperCase();
  const kindLabel = kindLabels[language][event.alert_kind];

  if (event.message_key === "alerts.recommendation_change") {
    const from = ratingLabel(payload.from, language);
    const to = ratingLabel(payload.to, language);
    return language === "sv"
      ? { kindLabel, title: `${ticker}: StockBox-ratingen ändrades`, body: `Den objektiva ratingen ändrades från ${from} till ${to}.` }
      : { kindLabel, title: `${ticker}: StockBox rating changed`, body: `The objective rating changed from ${from} to ${to}.` };
  }

  if (event.message_key === "alerts.conviction_drop") {
    const previous = numberLabel(payload.previous, language);
    const current = numberLabel(payload.current, language);
    return language === "sv"
      ? { kindLabel, title: `${ticker}: lägre modellövertygelse`, body: `Övertygelsen sjönk från ${previous} till ${current} av 100.` }
      : { kindLabel, title: `${ticker}: lower model conviction`, body: `Conviction fell from ${previous} to ${current} out of 100.` };
  }

  if (event.message_key === "alerts.data_quality_drop") {
    const previous = numberLabel(payload.previous, language);
    const current = numberLabel(payload.current, language);
    return language === "sv"
      ? { kindLabel, title: `${ticker}: lägre datakvalitet`, body: `Datakvaliteten sjönk från ${previous} till ${current} av 100. Det är en datavarning, inte ett bolagsbetyg.` }
      : { kindLabel, title: `${ticker}: lower data quality`, body: `Data quality fell from ${previous} to ${current} out of 100. This is a data warning, not a company rating.` };
  }

  if (event.message_key === "alerts.price_above" || event.message_key === "alerts.price_below") {
    const price = numberLabel(payload.currentPrice, language, 4);
    const threshold = numberLabel(payload.threshold, language, 4);
    const currency = text(payload.currency)?.toUpperCase() ?? "";
    const above = event.message_key === "alerts.price_above";
    return language === "sv"
      ? {
          kindLabel,
          title: `${ticker}: prisgräns passerad`,
          body: `Priset ${price}${currency ? ` ${currency}` : ""} passerade ${above ? "över" : "under"} din bevakningsgräns ${threshold}${currency ? ` ${currency}` : ""}.`,
        }
      : {
          kindLabel,
          title: `${ticker}: price threshold crossed`,
          body: `Price ${price}${currency ? ` ${currency}` : ""} moved ${above ? "above" : "below"} your watch threshold ${threshold}${currency ? ` ${currency}` : ""}.`,
        };
  }

  return language === "sv"
    ? { kindLabel, title: `${ticker}: ny StockBox-signal`, body: "En objektiv bevakningssignal registrerades från den senaste sparade analysen." }
    : { kindLabel, title: `${ticker}: new StockBox signal`, body: "An objective monitoring signal was recorded from the latest saved analysis." };
}
