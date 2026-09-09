import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("large ticker audit KPI wiring", () => {
  it("writes global coverage and rating KPIs into every shard summary", () => {
    const source = readFileSync("scripts/diagnostics/user-large-ticker-audit.test.ts", "utf8");

    expect(source).toContain('from "./user-large-ticker-kpis"');
    expect(source).toContain("buildGlobalAuditKpis(");
    expect(source).toMatch(/summary:\s*\{[\s\S]*?kpis[:,]/);
  });

  it("derives market buckets from ticker suffixes with an explicit unsuffixed bucket", () => {
    const source = readFileSync("scripts/diagnostics/user-large-ticker-audit.test.ts", "utf8");

    expect(source).toContain("UNSUFFIXED");
    expect(source).toContain("marketBucket");
  });
});
