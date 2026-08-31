import { describe, expect, it } from "vitest";
import { barGeometry, chartCoordinates, chartDomain, type ChartDatum } from "../../src/lib/analysis/chart-geometry";

const points: ChartDatum[] = [
  { label: "2024", dateKey: "2024", value: -0.2 },
  { label: "2025", dateKey: "2025", value: 0.1 },
  { label: "2026", dateKey: "2026", value: 0.3 },
];

describe("chart geometry", () => {
  it("can pin bar domains to zero for mixed positive and negative series", () => {
    expect(chartDomain(points, true)).toEqual({ min: -0.2, max: 0.3, range: 0.5 });
  });

  it("draws negative bars below the zero baseline and positive bars above it", () => {
    const domain = chartDomain(points, true);
    const coords = chartCoordinates(points, 720, 220, true);
    const negative = barGeometry(coords[0], domain, 220, coords.length);
    const positive = barGeometry(coords[2], domain, 220, coords.length);

    expect(negative.y).toBeCloseTo(negative.baselineY);
    expect(negative.height).toBeGreaterThan(2);
    expect(positive.y).toBeLessThan(positive.baselineY);
    expect(positive.height).toBeGreaterThan(negative.height);
  });

  it("keeps flat all-positive bar series visible from a zero baseline", () => {
    const flat = [
      { label: "2024", dateKey: "2024", value: 5 },
      { label: "2025", dateKey: "2025", value: 5 },
    ];
    const domain = chartDomain(flat, true);
    const coords = chartCoordinates(flat, 720, 220, true);
    const bar = barGeometry(coords[0], domain, 220, coords.length);

    expect(domain.min).toBe(0);
    expect(domain.max).toBe(5);
    expect(bar.y).toBeLessThan(bar.baselineY);
    expect(bar.height).toBeGreaterThan(100);
  });
});
