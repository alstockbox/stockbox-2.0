import { describe, expect, it } from "vitest";
import { mergeGlobalAuditShards } from "./merge-global-audit-shards.mjs";

function summary({ input, discovered, supported, completed, rated = 0, noRating = 0 }) {
  return {
    input,
    discovered,
    supported,
    completed,
    rated,
    noRating,
    discoveryRate: input ? discovered / input : null,
    supportCoverageRate: discovered ? supported / discovered : null,
    completionRate: supported ? completed / supported : null,
    ratingRate: completed ? rated / completed : null,
    noRatingRate: completed ? noRating / completed : null,
  };
}

function shard({ offset, results, totalInput = 6, source = "corpus.txt", overall, specialist, byMarket, bySecurityType, integrity }) {
  return {
    generatedAt: "2026-09-08T09:00:00.000Z",
    startedAt: "2026-09-08T08:00:00.000Z",
    offset,
    limit: results.length,
    concurrency: 3,
    source,
    totalInput,
    duplicates: [],
    invalid: [],
    results,
    summary: {
      kpis: {
        overall,
        specialist,
        integrity,
        byMarket,
        bySecurityType,
      },
    },
  };
}

const specialist = (input, completed, targetEligible, meets99PercentCoverage) => ({
  input,
  completed,
  targetEligible,
  meets99PercentCoverage,
  coverageTargetRate: targetEligible ? meets99PercentCoverage / targetEligible : null,
});

describe("global audit shard aggregation", () => {
  it("sums counts and recomputes global rates instead of averaging shard rates", () => {
    const first = shard({
      offset: 0,
      results: [{ query: "A" }, { query: "B" }],
      overall: summary({ input: 2, discovered: 2, supported: 1, completed: 1, rated: 1 }),
      specialist: specialist(1, 1, 1, 1),
      integrity: { ratingBelowCoverageTarget: ["B"], noRatingAtOrAboveCoverageTargetWithScore: [] },
      byMarket: { US: summary({ input: 2, discovered: 2, supported: 1, completed: 1, rated: 1 }) },
      bySecurityType: { "ETF/Fund": summary({ input: 2, discovered: 2, supported: 1, completed: 1, rated: 1 }) },
    });
    const second = shard({
      offset: 2,
      results: [{ query: "C" }, { query: "D" }, { query: "E" }, { query: "F" }],
      overall: summary({ input: 4, discovered: 3, supported: 3, completed: 2, noRating: 2 }),
      specialist: specialist(2, 2, 2, 1),
      integrity: { ratingBelowCoverageTarget: ["B"], noRatingAtOrAboveCoverageTargetWithScore: ["E"] },
      byMarket: {
        US: summary({ input: 1, discovered: 1, supported: 1, completed: 1, noRating: 1 }),
        ST: summary({ input: 3, discovered: 2, supported: 2, completed: 1, noRating: 1 }),
      },
      bySecurityType: {
        "ETF/Fund": summary({ input: 1, discovered: 1, supported: 1, completed: 1, noRating: 1 }),
        "Common Stock": summary({ input: 3, discovered: 2, supported: 2, completed: 1, noRating: 1 }),
      },
    });

    const merged = mergeGlobalAuditShards([first, second]);

    expect(merged.summary.kpis.overall).toEqual(expect.objectContaining({
      input: 6,
      discovered: 5,
      supported: 4,
      completed: 3,
      rated: 1,
      noRating: 2,
      discoveryRate: 5 / 6,
      supportCoverageRate: 4 / 5,
      completionRate: 3 / 4,
      ratingRate: 1 / 3,
      noRatingRate: 2 / 3,
    }));
    expect(merged.summary.kpis.specialist).toEqual({
      input: 3,
      completed: 3,
      targetEligible: 3,
      meets99PercentCoverage: 2,
      coverageTargetRate: 2 / 3,
    });
    expect(merged.summary.kpis.byMarket.US).toEqual(expect.objectContaining({ input: 3, completed: 2 }));
    expect(merged.summary.kpis.byMarket.ST).toEqual(expect.objectContaining({ input: 3, completed: 1 }));
    expect(merged.summary.kpis.bySecurityType["ETF/Fund"]).toEqual(expect.objectContaining({ input: 3, completed: 2 }));
    expect(merged.summary.kpis.integrity).toEqual({
      ratingBelowCoverageTarget: ["B"],
      noRatingAtOrAboveCoverageTargetWithScore: ["E"],
    });
    expect(merged.results.map((item) => item.query)).toEqual(["A", "B", "C", "D", "E", "F"]);
  });

  it("fails closed on gaps, overlaps, inconsistent corpus metadata, and incomplete result slices", () => {
    const baseKpis = {
      overall: summary({ input: 3, discovered: 3, supported: 3, completed: 3 }),
      specialist: specialist(0, 0, 0, 0),
      integrity: { ratingBelowCoverageTarget: [], noRatingAtOrAboveCoverageTargetWithScore: [] },
      byMarket: { US: summary({ input: 3, discovered: 3, supported: 3, completed: 3 }) },
      bySecurityType: { "Common Stock": summary({ input: 3, discovered: 3, supported: 3, completed: 3 }) },
    };
    const make = (offset, resultCount, overrides = {}) => shard({
      offset,
      results: Array.from({ length: resultCount }, (_, index) => ({ query: `${offset + index}` })),
      totalInput: overrides.totalInput ?? 6,
      source: overrides.source ?? "corpus.txt",
      ...baseKpis,
    });

    expect(() => mergeGlobalAuditShards([make(0, 3), make(4, 2)])).toThrow(/gap/i);
    expect(() => mergeGlobalAuditShards([make(0, 4), make(3, 3)])).toThrow(/overlap/i);
    expect(() => mergeGlobalAuditShards([make(0, 3), make(3, 3, { source: "other.txt" })])).toThrow(/source/i);
    expect(() => mergeGlobalAuditShards([make(0, 3), make(3, 3, { totalInput: 7 })])).toThrow(/totalInput/i);
    expect(() => mergeGlobalAuditShards([make(0, 3), make(3, 2)])).toThrow(/incomplete/i);
  });
});
