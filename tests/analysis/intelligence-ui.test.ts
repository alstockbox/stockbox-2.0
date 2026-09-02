import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const reportView = readFileSync(join(process.cwd(), "src/components/analysis/report-view.tsx"), "utf8");

describe("opportunity intelligence report integration", () => {
  it("renders the opportunity intelligence panel near the top of every report", () => {
    expect(reportView).toContain('import { OpportunityIntelligencePanel } from "./opportunity-intelligence-panel";');
    const intelligence = reportView.indexOf('<OpportunityIntelligencePanel report={report} mode={mode} locale={locale} />');
    const changeTracking = reportView.indexOf('<WhatChanged');
    const rawNumbers = reportView.indexOf('{showNumbers ? <Card>');

    expect(intelligence).toBeGreaterThan(-1);
    expect(intelligence).toBeLessThan(changeTracking);
    expect(intelligence).toBeLessThan(rawNumbers);
  });

  it("passes both UI mode and locale so the panel can stay compact and localized", () => {
    expect(reportView).toContain('mode={mode} locale={locale}');
  });
});
