import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { formatAnalysisTimestamp } from "../../src/lib/analysis/timestamp";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("canonical analysis timestamps", () => {
  it("formats the immutable generatedAt snapshot with date, time and timezone", () => {
    expect(formatAnalysisTimestamp("2026-08-31T07:49:42.282Z", "en")).toMatch(/31 Aug 2026.*07:49.*UTC/);
  });

  it("uses generatedAt across analysis surfaces instead of render time", () => {
    expect(read("src/components/analysis/report-view.tsx")).toContain("report.generatedAt");
    expect(read("src/app/history/page.tsx")).toContain("analysis.generated_at");
    expect(read("src/app/analyze/page.tsx")).toContain("item.generated_at");
    expect(read("src/components/batch/batch-workbench.tsx")).toContain("row.report?.generatedAt");
    expect(read("src/app/compare/page.tsx")).toContain("report.generatedAt");
  });
});
