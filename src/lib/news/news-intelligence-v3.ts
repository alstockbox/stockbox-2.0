export type NewsEventTypeV3 =
  | "earnings"
  | "guidance"
  | "m_and_a"
  | "regulatory"
  | "management"
  | "capital_allocation"
  | "contract"
  | "product"
  | "legal"
  | "cybersecurity"
  | "analyst_revision"
  | "macro"
  | "other";

export type NewsDirectionV3 = "positive" | "negative" | "mixed" | "neutral";

export type RawNewsItemV3 = {
  id: string;
  ticker: string;
  title: string;
  summary?: string | null;
  publishedAt: string;
  source: string;
  url: string;
};

export type NewsEventV3 = RawNewsItemV3 & {
  eventType: NewsEventTypeV3;
  direction: NewsDirectionV3;
  materiality: number;
  thesisImpact: "high" | "medium" | "low";
  requiresRecommendationReview: boolean;
  dedupeKey: string;
  evidenceText: string;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function normalizedText(item: RawNewsItemV3) {
  return `${item.title} ${item.summary ?? ""}`.toLowerCase();
}

function classifyEvent(text: string): NewsEventTypeV3 {
  if (/\b(fda|regulator|regulatory|approval|rejected|rejection|antitrust|sanction|license)\b/.test(text)) return "regulatory";
  if (/\b(guidance|outlook|forecast|full[- ]year target|raises? guidance|cuts? guidance)\b/.test(text)) return "guidance";
  if (/\b(earnings|results|revenue|eps|quarter|profit|loss|miss(?:es|ed)?|beats?)\b/.test(text)) return "earnings";
  if (/\b(acquir\w*|merger|takeover|buyout|strategic combination|deal to buy)\b/.test(text)) return "m_and_a";
  if (/\b(ceo|cfo|chairman|chairwoman|chief executive|management change|resigns?|appointed)\b/.test(text)) return "management";
  if (/\b(dividend|buyback|repurchase|capital raise|rights issue|secondary offering|debt issuance)\b/.test(text)) return "capital_allocation";
  if (/\b(contract|order win|awarded|framework agreement|customer win)\b/.test(text)) return "contract";
  if (/\b(cyber|ransomware|data breach|security incident|hacked)\b/.test(text)) return "cybersecurity";
  if (/\b(lawsuit|litigation|court|settlement|investigation|fraud)\b/.test(text)) return "legal";
  if (/\b(upgrade|downgrade|price target|analyst|rating change)\b/.test(text)) return "analyst_revision";
  if (/\b(rate cut|rate hike|inflation|gdp|recession|tariff|currency|macro)\b/.test(text)) return "macro";
  if (/\b(launch|product|release|introduces?|unveils?)\b/.test(text)) return "product";
  return "other";
}

function directionFromText(text: string): NewsDirectionV3 {
  const negative = (text.match(/\b(reject|rejected|cut|cuts|miss|missed|decline|fall|falls|lawsuit|breach|fraud|warning|recall|downgrade|resign|layoff|loss)\w*\b/g) ?? []).length;
  const positive = (text.match(/\b(approve|approved|raise|raises|beat|beats|growth|win|wins|awarded|upgrade|record|expand|expands)\w*\b/g) ?? []).length;
  if (positive > 0 && negative > 0) return "mixed";
  if (negative > positive) return "negative";
  if (positive > negative) return "positive";
  return "neutral";
}

function baseMateriality(eventType: NewsEventTypeV3): number {
  const scores: Record<NewsEventTypeV3, number> = {
    regulatory: 86,
    guidance: 82,
    earnings: 78,
    m_and_a: 80,
    cybersecurity: 76,
    legal: 70,
    management: 63,
    capital_allocation: 62,
    contract: 58,
    analyst_revision: 48,
    macro: 45,
    product: 38,
    other: 25,
  };
  return scores[eventType];
}

function materialityAdjustments(text: string, direction: NewsDirectionV3): number {
  let adjustment = 0;
  if (/\b(lead drug|bankruptcy|default|going concern|material weakness|criminal|major acquisition|transformative)\b/.test(text)) adjustment += 12;
  if (/\b(full[- ]year|annual|material|significant|major)\b/.test(text)) adjustment += 5;
  if (direction === "mixed") adjustment += 2;
  if (/\b(routine|minor|small regional|refresh)\b/.test(text)) adjustment -= 12;
  return adjustment;
}

function normalizeHeadline(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9åäö]+/gi, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function deriveNewsEventV3(item: RawNewsItemV3): NewsEventV3 {
  const text = normalizedText(item);
  const eventType = classifyEvent(text);
  const direction = directionFromText(text);
  const materiality = Math.round(clamp(baseMateriality(eventType) + materialityAdjustments(text, direction), 0, 100));
  const thesisImpact: NewsEventV3["thesisImpact"] = materiality >= 75 ? "high" : materiality >= 50 ? "medium" : "low";
  const requiresRecommendationReview = materiality >= 75
    || ["guidance", "earnings", "regulatory", "m_and_a", "cybersecurity"].includes(eventType);

  return {
    ...item,
    eventType,
    direction,
    materiality,
    thesisImpact,
    requiresRecommendationReview,
    dedupeKey: `${item.ticker.toUpperCase()}::${normalizeHeadline(item.title)}`,
    evidenceText: `${item.title}${item.summary ? ` — ${item.summary}` : ""}`,
  };
}

export function rankAndDedupeNewsEventsV3(items: RawNewsItemV3[]): NewsEventV3[] {
  const bestByKey = new Map<string, NewsEventV3>();
  for (const item of items) {
    const event = deriveNewsEventV3(item);
    const existing = bestByKey.get(event.dedupeKey);
    if (!existing || event.materiality > existing.materiality || Date.parse(event.publishedAt) > Date.parse(existing.publishedAt)) {
      bestByKey.set(event.dedupeKey, event);
    }
  }
  return [...bestByKey.values()].sort((a, b) => {
    if (b.materiality !== a.materiality) return b.materiality - a.materiality;
    return Date.parse(b.publishedAt) - Date.parse(a.publishedAt);
  });
}
