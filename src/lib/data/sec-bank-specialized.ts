export type SecBankMetricKey = "cet1CapitalRatio";

export type SecBankObservation = {
  metric: SecBankMetricKey;
  value: number;
  unit: "ratio";
  dataAsOf: string | null;
  label: string;
  sourceUrl: string;
  valueKind: "reported";
};

export type SecBankDocumentContext = {
  sourceUrl: string;
  periodEnd?: string | null;
};

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&gt;|&#62;/gi, ">")
    .replace(/&lt;|&#60;/gi, "<")
    .replace(/&ndash;|&#8211;/gi, "-")
    .replace(/&mdash;|&#8212;/gi, "-")
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

export function parseSecBankSpecializedDocument(
  html: string,
  context: SecBankDocumentContext,
): SecBankObservation[] {
  for (const line of documentLines(html)) {
    if (/\b(requirement|required|minimum|buffer)\b/i.test(line)) continue;
    const match = line.match(
      /\b(?:common\s+equity\s+tier\s+1\s*(?:\([^)]*CET1[^)]*\))?|CET1)\s+capital\s+ratio\s*-\s*Standardized\b(?:(?!\d{1,2}(?:\.\d+)?\s*%).){0,80}?(\d{1,2}(?:\.\d+)?)\s*%/i,
    );
    if (!match) continue;
    const value = Number(match[1]) * 0.01;
    if (!Number.isFinite(value) || value <= 0 || value > 1) continue;
    return [{
      metric: "cet1CapitalRatio",
      value,
      unit: "ratio",
      dataAsOf: context.periodEnd ?? null,
      label: match[0].replace(/\s+/g, " ").trim(),
      sourceUrl: context.sourceUrl,
      valueKind: "reported",
    }];
  }
  return [];
}
