import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { chartDomain, gapAwareLineGeometry } from "../../src/lib/analysis/chart-geometry";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("chart gap integrity P0", () => {
  it("splits line paths at missing observations without collapsing the time axis", () => {
    const points = [
      { label: "2021", dateKey: "2021", value: 10 },
      { label: "2022", dateKey: "2022", value: 12 },
      { label: "2023", dateKey: "2023", value: null },
      { label: "2024", dateKey: "2024", value: 14 },
      { label: "2025", dateKey: "2025", value: 16 },
    ];
    const numeric = points.filter((point): point is { label: string; dateKey: string; value: number } => typeof point.value === "number");
    const domain = chartDomain(numeric);
    const geometry = gapAwareLineGeometry(points, domain, 500, 200, 20, 20);

    expect(geometry.paths).toHaveLength(2);
    expect(geometry.coordinates.map((point) => point.sourceIndex)).toEqual([0, 1, 3, 4]);
    expect(geometry.coordinates[1].x).toBeCloseTo(135);
    expect(geometry.coordinates[2].x).toBeCloseTo(365);
    expect(geometry.paths[0]).not.toContain("365.0");
    expect(geometry.paths[1]).not.toContain("135.0");
  });

  it("treats non-finite values as gaps and never joins across them", () => {
    const points = [
      { label: "A", dateKey: "A", value: 1 },
      { label: "B", dateKey: "B", value: Number.NaN },
      { label: "C", dateKey: "C", value: 3 },
      { label: "D", dateKey: "D", value: 4 },
    ];
    const domain = { min: 1, max: 4, range: 3 };
    const geometry = gapAwareLineGeometry(points, domain, 400, 180);

    expect(geometry.coordinates.map((point) => point.dateKey)).toEqual(["A", "C", "D"]);
    expect(geometry.paths).toHaveLength(1);
    expect(geometry.paths[0]).toMatch(/^M/);
  });

  it("wires both historical line-chart surfaces to the gap-aware geometry", () => {
    const research = read("src/components/analysis/historical-research.tsx");
    const explorer = read("src/components/analysis/historical-chart-explorer.tsx");

    expect(research).toContain("gapAwareLineGeometry");
    expect(research).toContain("paths.map");
    expect(explorer).toContain("gapAwareLineGeometry");
    expect(explorer).toContain("paths.map");
  });
});
