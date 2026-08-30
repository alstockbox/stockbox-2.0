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

  it("supports comparing two or three saved reports without changing the underlying reports", () => {
    expect(existsSync(join(root, "src/app/compare/page.tsx"))).toBe(true);
    const compare = read("src/app/compare/page.tsx");
    expect(compare).toContain("getUserAnalysisHistory");
    expect(compare).toContain("getAnalysis");
    expect(compare).toContain("slice(0, 3)");
    expect(compare).toContain("recommendation");
    expect(compare).toContain("score.dimensions");
  });
});
