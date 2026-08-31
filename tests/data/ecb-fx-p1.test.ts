import { describe, expect, it } from "vitest";
import {
  convertWithEcbRates,
  parseEcbReferenceRateXml,
  selectEcbRatesAtOrBefore,
} from "@/lib/data/ecb-fx";
import { comparisonWarnings } from "@/lib/analysis/comparison";
import type { AnalysisReport } from "@/lib/analysis/types";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<gesmes:Envelope>
  <Cube>
    <Cube time="2026-08-28">
      <Cube currency="USD" rate="1.1600"/>
      <Cube currency="SEK" rate="11.0800"/>
      <Cube currency="GBP" rate="0.8600"/>
    </Cube>
    <Cube time="2026-08-31">
      <Cube currency="USD" rate="1.1700"/>
      <Cube currency="SEK" rate="11.1100"/>
      <Cube currency="GBP" rate="0.8700"/>
    </Cube>
  </Cube>
</gesmes:Envelope>`;

describe("ECB FX normalization P1", () => {
  it("parses ECB rates as foreign-currency units per EUR and injects EUR=1", () => {
    const observations = parseEcbReferenceRateXml(SAMPLE_XML);
    expect(observations).toHaveLength(2);
    expect(observations[0]).toMatchObject({
      date: "2026-08-28",
      ratesPerEuro: { EUR: 1, USD: 1.16, SEK: 11.08, GBP: 0.86 },
    });
  });

  it("uses the latest rate on or before the snapshot date and never looks ahead", () => {
    const observations = parseEcbReferenceRateXml(SAMPLE_XML);
    expect(selectEcbRatesAtOrBefore(observations, "2026-08-30")?.date).toBe("2026-08-28");
    expect(selectEcbRatesAtOrBefore(observations, "2026-08-31")?.date).toBe("2026-08-31");
  });

  it("converts through EUR deterministically and rejects unsupported currencies", () => {
    const rates = parseEcbReferenceRateXml(SAMPLE_XML)[1];
    expect(convertWithEcbRates(11_110, "SEK", "EUR", rates)).toBeCloseTo(1_000, 8);
    expect(convertWithEcbRates(1_170, "USD", "SEK", rates)).toBeCloseTo(11_110, 8);
    expect(convertWithEcbRates(100, "XYZ", "EUR", rates)).toBeNull();
  });

  it("does not use an excessively stale observation", () => {
    const observations = parseEcbReferenceRateXml(SAMPLE_XML).slice(0, 1);
    expect(selectEcbRatesAtOrBefore(observations, "2026-09-10", 7)).toBeNull();
  });

  it("changes the mixed-currency warning when every snapshot has verified FX normalization", () => {
    const reports = [
      { reportingCurrency: "SEK" },
      { reportingCurrency: "USD" },
    ] as AnalysisReport[];
    const nativeWarning = comparisonWarnings(reports, "en");
    const normalizedWarning = comparisonWarnings(reports, "en", { fxNormalized: true, fxTargetCurrency: "EUR" });
    expect(nativeWarning.join(" ")).toContain("native currency");
    expect(normalizedWarning.join(" ")).toContain("ECB");
    expect(normalizedWarning.join(" ")).toContain("EUR");
    expect(normalizedWarning.join(" ")).not.toContain("not ranked directly");
  });

  it("wires dated ECB normalization and source attribution into the comparison page", () => {
    const page = readFileSync(join(process.cwd(), "src/app/compare/page.tsx"), "utf8");
    expect(page).toContain("resolveComparisonFxContexts");
    expect(page).toContain("Source: ECB statistics");
    expect(page).toContain("rateDate");
    expect(page).toContain("fxNormalized");
  });
});
