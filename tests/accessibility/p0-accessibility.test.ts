import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("P0 accessibility", () => {
  it("provides a keyboard skip link to the main content", () => {
    const layout = read("src/app/layout.tsx");
    expect(layout).toMatch(/href="#main-content"/);
    expect(layout).toMatch(/id="main-content"/);
  });

  it("exposes meters as progress bars", () => {
    const meter = read("src/components/ui/meter.tsx");
    expect(meter).toMatch(/role="progressbar"/);
    expect(meter).toMatch(/aria-valuenow/);
    expect(meter).toMatch(/aria-valuemin/);
    expect(meter).toMatch(/aria-valuemax/);
  });

  it("exposes batch progress to assistive technology", () => {
    const batch = read("src/components/batch/batch-workbench.tsx");
    expect(batch).toMatch(/role="progressbar"/);
    expect(batch).toMatch(/aria-valuenow=\{progress\}/);
    expect(batch).toMatch(/aria-valuemin=\{0\}/);
    expect(batch).toMatch(/aria-valuemax=\{100\}/);
  });

  it("hides the redundant visual score chart from screen readers", () => {
    const chart = read("src/components/analysis/score-chart.tsx");
    expect(chart).toMatch(/aria-hidden="true"/);
  });
});