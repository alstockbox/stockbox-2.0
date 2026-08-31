import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("research utility launch improvements", () => {
  it("makes saved analyses reachable directly from Analyze", () => {
    const analyze = read("src/app/analyze/page.tsx");
    expect(analyze).toContain("getUserAnalysisHistory");
    expect(analyze).toContain('href="/history"');
    expect(analyze).toContain("recentAnalyses");
  });

  it("shows the same model recommendation in batch review that is exported to CSV", () => {
    const batch = read("src/components/batch/batch-workbench.tsx");
    expect(batch).toContain("copy.recommendation");
    expect(batch).toContain("row.report?.recommendation");
  });

  it("lets batch users search for companies while still supporting pasted ticker lists", () => {
    const batch = read("src/components/batch/batch-workbench.tsx");
    expect(batch).toContain("/api/companies/search");
    expect(batch).toContain("batch-company-search");
    expect(batch).toContain('role="listbox"');
    expect(batch).toContain('role="option"');
    expect(batch).toContain("aria-controls");
    expect(batch).toContain("appendTicker");
    expect(batch).toContain("AbortController");
    expect(batch).toContain("window.setTimeout");
    expect(batch).toContain("parsed.symbols.includes(normalized)");
    expect(batch).toContain("removeTicker");
    expect(batch).toContain("copy.selectedTickers");
    expect(batch).toContain("batch-tickers");
  });

  it("makes the interactive historical chart readable in line and bar modes", () => {
    const chart = read("src/components/analysis/historical-chart-explorer.tsx");
    expect(chart).toContain('ChartType = "line" | "bar"');
    expect(chart).toContain("strokeDasharray");
    expect(chart).toContain("barGeometry");
    expect(chart).toContain("<title>{`${point.label}:");
    expect(chart).toContain("onTouchStart");
    expect(chart).toContain("activeMetricLabel");
    expect(chart).toContain('fontSize="15"');
  });

  it("supports comparing two or three saved reports without changing the underlying reports", () => {
    expect(existsSync(join(root, "src/app/compare/page.tsx"))).toBe(true);
    const compare = read("src/app/compare/page.tsx");
    expect(compare).toContain("getUserAnalysisHistory");
    expect(compare).toContain("getAnalysis");
    expect(compare).toContain("slice(0, 3)");
    expect(compare).toContain("recommendation");
    expect(compare).toContain("score.dimensions");
    expect(compare).toContain("generatedAt");
    expect(compare).toContain("modelVersion");
    expect(compare.match(/Analysis date/g) ?? []).toHaveLength(1);
    expect(compare.match(/Engine version/g) ?? []).toHaveLength(1);
  });
});
