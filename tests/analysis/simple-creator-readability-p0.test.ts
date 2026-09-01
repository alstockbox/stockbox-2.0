import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const reportView = read("src/components/analysis/report-view.tsx");
const historicalView = read("src/components/analysis/historical-research.tsx");

describe("Simple Mode creator readability P0", () => {
  it("keeps Simple Mode simple even when the underlying report is deep or research", () => {
    expect(reportView).toContain('const showExplainability = mode === "pro";');
    expect(reportView).toContain('const showNumbers = mode === "pro";');
    expect(reportView).toContain('const showValuation = mode === "pro";');
    expect(reportView).not.toContain('const showExplainability = mode === "pro" || extended;');
    expect(reportView).not.toContain('const showValuation = mode === "pro" || extended;');
  });

  it("places the Simple historical decision surface before change tracking, flags and raw-number grids", () => {
    const simpleHistory = reportView.indexOf('{mode === "simple" && report.historical ? <HistoricalResearchView');
    const whatChanged = reportView.indexOf('<WhatChanged');
    const redFlags = reportView.indexOf('{copy.redFlags}');
    const rawNumbers = reportView.indexOf('{showNumbers ? <Card>');

    expect(simpleHistory).toBeGreaterThan(-1);
    expect(simpleHistory).toBeLessThan(whatChanged);
    expect(simpleHistory).toBeLessThan(redFlags);
    expect(simpleHistory).toBeLessThan(rawNumbers);
    expect(reportView).toContain('{mode === "pro" && report.historical ? <HistoricalResearchView');
  });

  it("puts the master historical snapshot first in Simple Mode and coverage after decision context", () => {
    const renderStart = historicalView.indexOf('export function HistoricalResearchView');
    const source = historicalView.slice(renderStart);
    const snapshot = source.indexOf('{mode === "simple" && !holdingCompany ? <HistoricalSnapshot');
    const price = source.indexOf('{mode === "simple" ? <PriceContextCard');
    const dividend = source.indexOf('{showDividendSnapshot ? <DividendSnapshot');
    const discountQuality = source.indexOf('<HistoricalDiscountQualityCard');
    const overview = source.indexOf('<HistoricalOverview');
    const coverage = source.indexOf('{mode === "simple" ? <HistoricalCoverageCard');

    expect(snapshot).toBeGreaterThan(-1);
    expect(snapshot).toBeLessThan(price);
    expect(price).toBeLessThan(dividend);
    expect(dividend).toBeLessThan(discountQuality);
    expect(discountQuality).toBeLessThan(overview);
    expect(overview).toBeLessThan(coverage);
  });

  it("keeps creator-critical Simple copy readable instead of exposing engineering-first labels at the top", () => {
    expect(reportView).toContain("Investment lens");
    expect(reportView).toContain("copy.companySnapshot");
    expect(historicalView).toContain("Historical snapshot");
    expect(historicalView).toContain("Price context");
    expect(historicalView).toContain("Historical Discount Quality");
    expect(historicalView).toContain("Historical coverage");
  });
});