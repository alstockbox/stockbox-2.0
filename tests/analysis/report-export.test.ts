import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("saved report print/PDF export", () => {
  it("exposes a client print action from the report surface", () => {
    const actions = readFileSync(join(process.cwd(), "src/components/analysis/report-export-actions.tsx"), "utf8");
    const report = readFileSync(join(process.cwd(), "src/components/analysis/report-view.tsx"), "utf8");
    expect(actions).toContain("window.print()");
    expect(actions).toContain("print:hidden");
    expect(report).toContain("ReportExportActions");
    expect(report).toContain("data-report-print");
  });

  it("uses a dedicated print stylesheet so PDF output stays readable", () => {
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
    expect(css).toContain("@media print");
    expect(css).toContain("[data-report-print]");
    expect(css).toContain("@page");
  });
});