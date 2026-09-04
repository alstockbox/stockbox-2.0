export type SecReitMetricKey =
  | "occupancy"
  | "sameStoreNoiGrowth"
  | "netDebtToEbitdare"
  | "fixedChargeCoverage";

export type SecReitObservation = {
  metric: SecReitMetricKey;
  value: number;
  unit: "ratio";
  dataAsOf: string | null;
  label: string;
  sourceUrl: string;
};

export type SecReitDocumentContext = {
  sourceUrl: string;
  periodEnd?: string | null;
};

type ParserRule = {
  metric: SecReitMetricKey;
  pattern: RegExp;
  scale: number;
};

const GUIDANCE_LANGUAGE = /\b(guidance|outlook|forecast|expected|expects|approximately|approx\.?|target|range)\b/i;

const RULES: ParserRule[] = [
  {
    metric: "occupancy",
    pattern: /\b(?:period[- ]end\s+|average\s+|property[- ]level\s+)?occupancy\b(?:(?!\d{1,3}(?:\.\d+)?\s*%).){0,96}?(\d{1,3}(?:\.\d+)?)\s*%/i,
    scale: 0.01,
  },
  {
    metric: "occupancy",
    pattern: /(\d{1,3}(?:\.\d+)?)\s*%\s+(?:property[- ]level\s+)?occupancy\b/i,
    scale: 0.01,
  },
  {
    metric: "sameStoreNoiGrowth",
    pattern: /\b(?:cash\s+)?same[- ]store(?:\s+cash)?\s+noi(?:\s+growth)?\*?\b(?:(?![+\-]?\d{1,3}(?:\.\d+)?\s*%).){0,96}?([+\-]?\d{1,3}(?:\.\d+)?)\s*%/i,
    scale: 0.01,
  },
  {
    metric: "netDebtToEbitdare",
    pattern: /\bnet\s+debt(?:\s+and\s+preferred\s+stock)?\s*(?:to|\/)\s*(?:annualized\s+(?:pro\s+forma\s+)?)?(?:adjusted\s+)?ebitdare\b(?:(?!\d{1,2}(?:\.\d+)?\s*x).){0,96}?(\d{1,2}(?:\.\d+)?)\s*x\b/i,
    scale: 1,
  },
  {
    metric: "fixedChargeCoverage",
    pattern: /\bfixed[- ]charge\s+coverage(?:\s+ratio)?\b(?:(?!\d{1,2}(?:\.\d+)?\s*x).){0,96}?(\d{1,2}(?:\.\d+)?)\s*x\b/i,
    scale: 1,
  },
];

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&ndash;|&#8211;/gi, "-")
    .replace(/&mdash;|&#8212;/gi, "-")
    .replace(/&times;/gi, "x")
    .replace(/&#(\d+);/g, (_match, code: string) => {
      const valueCode = Number(code);
      return Number.isInteger(valueCode) && valueCode > 0 && valueCode <= 0x10ffff
        ? String.fromCodePoint(valueCode)
        : " ";
    });
}

function documentLines(html: string): string[] {
  const text = decodeHtmlEntities(html)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|tr|li|h[1-6]|table|section)>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function plausibleRatio(metric: SecReitMetricKey, value: number): boolean {
  if (!Number.isFinite(value) || value < 0) return false;
  if (metric === "occupancy") return value > 0 && value <= 1;
  if (metric === "sameStoreNoiGrowth") return value >= -1 && value <= 2;
  return value > 0 && value <= 100;
}

export function parseSecReitSpecializedDocument(
  html: string,
  context: SecReitDocumentContext,
): SecReitObservation[] {
  const observations = new Map<SecReitMetricKey, SecReitObservation>();

  for (const line of documentLines(html)) {
    if (GUIDANCE_LANGUAGE.test(line)) continue;
    for (const rule of RULES) {
      if (observations.has(rule.metric)) continue;
      const match = line.match(rule.pattern);
      if (!match) continue;
      const raw = Number(match[1]);
      const value = raw * rule.scale;
      if (!plausibleRatio(rule.metric, value)) continue;
      observations.set(rule.metric, {
        metric: rule.metric,
        value,
        unit: "ratio",
        dataAsOf: context.periodEnd ?? null,
        label: match[0].replace(/\s+/g, " ").trim(),
        sourceUrl: context.sourceUrl,
      });
    }
  }

  return [...observations.values()];
}
