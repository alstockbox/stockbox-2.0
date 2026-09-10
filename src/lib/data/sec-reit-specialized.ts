export type SecReitMetricKey =
  | "fundsFromOperationsPerShare"
  | "adjustedFundsFromOperationsPerShare"
  | "affoPayout"
  | "occupancy"
  | "sameStoreNoiGrowth"
  | "netDebtToEbitdare"
  | "fixedChargeCoverage";

type SecReitRatioMetricKey = Exclude<
  SecReitMetricKey,
  "fundsFromOperationsPerShare" | "adjustedFundsFromOperationsPerShare"
>;

type SecReitPerShareMetricKey = Extract<
  SecReitMetricKey,
  "fundsFromOperationsPerShare" | "adjustedFundsFromOperationsPerShare"
>;

export type SecReitObservation = {
  metric: SecReitMetricKey;
  value: number;
  unit: "ratio" | "per_share";
  dataAsOf: string | null;
  label: string;
  sourceUrl: string;
};

export type SecReitDocumentContext = {
  sourceUrl: string;
  periodEnd?: string | null;
};

type ParserRule = {
  metric: SecReitRatioMetricKey;
  pattern: RegExp;
  scale: number;
  priority: number;
};

const GUIDANCE_LANGUAGE = /\b(guidance|outlook|forecast|expected|expects|approximately|approx\.?|target|range)\b/i;
const THREE_MONTH_RESULTS = /\bthree\s+months?\s+ended\b/i;
const NON_QUARTER_RESULTS = /\b(?:six|nine|twelve)\s+months?\s+ended\b|\byear\s+ended\b/i;
const FINANCIAL_DATE_MARKER = /\b(?:as\s+of|at|three\s+months?\s+ended|quarter(?:ly)?\s+ended)\b/i;
const MODIFIED_FFO_ALIAS = /\b(?:core|normalized|modified|adjusted)\s+ffo\b/i;
const FIXED_CHARGE_LABEL = /\bfixed[- ]charge\s+coverage(?:\s+ratio)?\b/i;
const MONTHS: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};
const ENGLISH_DATE = /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s*(\d{4})\b/i;

const RULES: ParserRule[] = [
  {
    metric: "affoPayout",
    pattern: /\bAFFO\s+Payout\s*%?\s+(\d{1,3}(?:\.\d+)?)\s*%/i,
    scale: 0.01,
    priority: 100,
  },
  {
    metric: "affoPayout",
    pattern: /\brepresenting\s+(\d{1,3}(?:\.\d+)?)\s*%\s+of\s+(?:our\s+)?diluted\s+AFFO\s+per\s+(?:common\s+)?share\b/i,
    scale: 0.01,
    priority: 90,
  },
  {
    metric: "occupancy",
    pattern: /\boccupancy\s*-\s*by\s+number\s+of\s+properties(?:\(\d+\))?\s*(\d{1,3}(?:\.\d+)?)\s*%/i,
    scale: 0.01,
    priority: 100,
  },
  {
    metric: "occupancy",
    pattern: /(\d{1,3}(?:\.\d+)?)\s*%\s+(?:property[- ]level\s+)?occupancy\b/i,
    scale: 0.01,
    priority: 90,
  },
  {
    metric: "occupancy",
    pattern: /\b(?:period[- ]end|average|property[- ]level)\s+occupancy\b(?:(?!\d{1,3}(?:\.\d+)?\s*%).){0,96}?(\d{1,3}(?:\.\d+)?)\s*%/i,
    scale: 0.01,
    priority: 80,
  },
  {
    metric: "occupancy",
    pattern: /\boccupancy\b(?:(?!\d{1,3}(?:\.\d+)?\s*%).){0,96}?(\d{1,3}(?:\.\d+)?)\s*%/i,
    scale: 0.01,
    priority: 10,
  },
  {
    metric: "sameStoreNoiGrowth",
    pattern: /\b(?:cash\s+)?same[- ]store(?:\s+cash)?\s+noi(?:\s+growth)?\*?\b(?:(?![+\-]?\d{1,3}(?:\.\d+)?\s*%).){0,96}?([+\-]?\d{1,3}(?:\.\d+)?)\s*%/i,
    scale: 0.01,
    priority: 50,
  },
  {
    metric: "netDebtToEbitdare",
    pattern: /\bnet\s+debt(?:\s+and\s+preferred\s+stock)?\s*(?:to|\/)\s*(?:annualized\s+(?:pro\s+forma\s+)?)?(?:adjusted\s+)?ebitdare\b(?:(?!\d{1,2}(?:\.\d+)?\s*x).){0,96}?(\d{1,2}(?:\.\d+)?)\s*x\b/i,
    scale: 1,
    priority: 50,
  },
  {
    metric: "fixedChargeCoverage",
    pattern: /\bfixed[- ]charge\s+coverage(?:\s+ratio)?\b(?:(?!\d{1,2}(?:\.\d+)?\s*x).){0,96}?(\d{1,2}(?:\.\d+)?)\s*x\b/i,
    scale: 1,
    priority: 50,
  },
];

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&gt;|&#62;/gi, ">")
    .replace(/&lt;|&#60;/gi, "<")
    .replace(/&ge;|&#8805;/gi, "≥")
    .replace(/&le;|&#8804;/gi, "≤")
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

function plausibleRatio(metric: SecReitRatioMetricKey, value: number): boolean {
  if (!Number.isFinite(value) || value < 0) return false;
  if (metric === "occupancy") return value > 0 && value <= 1;
  if (metric === "sameStoreNoiGrowth") return value >= -1 && value <= 2;
  return value > 0 && value <= 100;
}

function englishDateToIso(line: string): string | null {
  const match = line.match(ENGLISH_DATE);
  if (!match) return null;
  const month = MONTHS[match[1].toLowerCase()];
  const day = Number(match[2]);
  const year = Number(match[3]);
  if (!month || !Number.isInteger(day) || day < 1 || day > 31 || !Number.isInteger(year)) return null;
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (
    candidate.getUTCFullYear() !== year
    || candidate.getUTCMonth() !== month - 1
    || candidate.getUTCDate() !== day
  ) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function explicitQuarterEndOnLine(line: string): string | null {
  const marker = line.match(THREE_MONTH_RESULTS);
  if (!marker || marker.index === undefined) return null;
  return englishDateToIso(line.slice(marker.index));
}

function isIsoDate(value: string | null | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function latestExplicitFinancialDate(lines: string[], fallback: string | null | undefined): string | null {
  const candidates: string[] = [];
  let awaitingQuarterDate = false;

  for (const line of lines) {
    if (GUIDANCE_LANGUAGE.test(line)) continue;

    if (FINANCIAL_DATE_MARKER.test(line)) {
      const date = englishDateToIso(line);
      if (date) candidates.push(date);
      awaitingQuarterDate = THREE_MONTH_RESULTS.test(line) && !date;
      continue;
    }

    if (awaitingQuarterDate) {
      const date = englishDateToIso(line);
      if (date) candidates.push(date);
      awaitingQuarterDate = false;
    }
  }

  const bounded = isIsoDate(fallback)
    ? candidates.filter((date) => date <= fallback)
    : candidates;
  return bounded.sort((left, right) => right.localeCompare(left))[0]
    ?? (isIsoDate(fallback) ? fallback : null);
}

function fixedChargeLooksLikeThreshold(line: string): boolean {
  const label = line.match(FIXED_CHARGE_LABEL);
  if (!label || label.index === undefined) return false;
  const tail = line.slice(label.index + label[0].length, label.index + label[0].length + 40);
  return /^\s*(?:[<>]=?|[≥≤])\s*\d/i.test(tail);
}

function firstPerShareNumber(line: string, label: RegExp): number | null {
  const cleaned = line.replace(/\(\d+\)/g, " ");
  const match = cleaned.match(label);
  if (!match || match.index === undefined) return null;
  const tail = cleaned.slice(match.index + match[0].length, match.index + match[0].length + 96);
  const valueMatch = tail.match(/(?:[$€£]\s*)?([+\-]?\d{1,4}(?:\.\d+)?)/);
  if (!valueMatch) return null;
  const value = Number(valueMatch[1]);
  return Number.isFinite(value) && Math.abs(value) <= 10_000 ? value : null;
}

function perShareObservation(
  metric: SecReitPerShareMetricKey,
  value: number,
  dataAsOf: string,
  line: string,
  context: SecReitDocumentContext,
): SecReitObservation {
  return {
    metric,
    value,
    unit: "per_share",
    dataAsOf,
    label: line.replace(/\s+/g, " ").trim(),
    sourceUrl: context.sourceUrl,
  };
}

function parsePeriodSafePerShareObservations(
  lines: string[],
  context: SecReitDocumentContext,
): SecReitObservation[] {
  const observations = new Map<SecReitPerShareMetricKey, SecReitObservation>();
  let currentQuarterEnd: string | null = null;
  let awaitingQuarterDate = false;
  let sectionMetric: SecReitPerShareMetricKey | null = null;

  for (const line of lines) {
    if (GUIDANCE_LANGUAGE.test(line)) continue;

    const hasQuarterHeader = THREE_MONTH_RESULTS.test(line);
    if (hasQuarterHeader) {
      currentQuarterEnd = englishDateToIso(line);
      awaitingQuarterDate = currentQuarterEnd === null;
      sectionMetric = null;
    } else if (NON_QUARTER_RESULTS.test(line)) {
      currentQuarterEnd = null;
      awaitingQuarterDate = false;
      sectionMetric = null;
      continue;
    } else if (awaitingQuarterDate) {
      const periodEnd = englishDateToIso(line);
      if (periodEnd) {
        currentQuarterEnd = periodEnd;
        awaitingQuarterDate = false;
      }
    }

    if (!currentQuarterEnd) continue;

    if (/^FFO\s+per\s+common\s+share\b/i.test(line) && !MODIFIED_FFO_ALIAS.test(line)) {
      sectionMetric = "fundsFromOperationsPerShare";
      continue;
    }
    if (/^AFFO\s+per\s+common\s+share\b/i.test(line)) {
      sectionMetric = "adjustedFundsFromOperationsPerShare";
      continue;
    }

    if (sectionMetric && /^basic\b/i.test(line)) continue;
    if (sectionMetric && /^diluted\b/i.test(line)) {
      const value = firstPerShareNumber(line, /^diluted\b/i);
      if (value !== null && !observations.has(sectionMetric)) {
        observations.set(
          sectionMetric,
          perShareObservation(sectionMetric, value, currentQuarterEnd, line, context),
        );
      }
      sectionMetric = null;
      continue;
    }

    if (!observations.has("fundsFromOperationsPerShare") && !MODIFIED_FFO_ALIAS.test(line)) {
      const value = firstPerShareNumber(line, /\bdiluted\s+FFO\s+per\s+(?:common\s+)?share\b/i);
      if (value !== null) {
        observations.set(
          "fundsFromOperationsPerShare",
          perShareObservation("fundsFromOperationsPerShare", value, currentQuarterEnd, line, context),
        );
      }
    }

    if (!observations.has("adjustedFundsFromOperationsPerShare")) {
      const value = firstPerShareNumber(line, /\bdiluted\s+AFFO\s+per\s+(?:common\s+)?share\b/i);
      if (value !== null) {
        observations.set(
          "adjustedFundsFromOperationsPerShare",
          perShareObservation("adjustedFundsFromOperationsPerShare", value, currentQuarterEnd, line, context),
        );
      }
    }
  }

  return [...observations.values()];
}

export function parseSecReitSpecializedDocument(
  html: string,
  context: SecReitDocumentContext,
): SecReitObservation[] {
  const lines = documentLines(html);
  const observations = new Map<SecReitMetricKey, SecReitObservation>();
  const ratioPriorities = new Map<SecReitRatioMetricKey, number>();
  const ratioDataAsOf = latestExplicitFinancialDate(lines, context.periodEnd);

  for (const observation of parsePeriodSafePerShareObservations(lines, context)) {
    observations.set(observation.metric, observation);
  }

  for (const line of lines) {
    if (GUIDANCE_LANGUAGE.test(line)) continue;
    for (const rule of RULES) {
      const currentPriority = ratioPriorities.get(rule.metric);
      if (currentPriority !== undefined && currentPriority >= rule.priority) continue;
      if (rule.metric === "fixedChargeCoverage" && fixedChargeLooksLikeThreshold(line)) continue;
      const match = line.match(rule.pattern);
      if (!match) continue;
      const raw = Number(match[1]);
      const value = raw * rule.scale;
      if (!plausibleRatio(rule.metric, value)) continue;
      observations.set(rule.metric, {
        metric: rule.metric,
        value,
        unit: "ratio",
        dataAsOf: rule.metric === "affoPayout"
          ? (explicitQuarterEndOnLine(line) ?? ratioDataAsOf)
          : ratioDataAsOf,
        label: match[0].replace(/\s+/g, " ").trim(),
        sourceUrl: context.sourceUrl,
      });
      ratioPriorities.set(rule.metric, rule.priority);
    }
  }

  return [...observations.values()];
}
