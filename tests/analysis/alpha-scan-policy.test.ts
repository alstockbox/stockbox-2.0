import { describe, expect, it } from "vitest";
import { selectScannerCandidates, type ScannerCandidate } from "../../src/lib/alpha/scan-policy";

function row(id: string, lastPredictionAt: string | null): ScannerCandidate {
  return {
    id,
    ticker: id,
    lastPredictionAt,
  };
}

describe("Alpha universe scanner policy", () => {
  it("prioritizes never-scanned securities before stale securities", () => {
    const selected = selectScannerCandidates([
      row("RECENT", "2026-08-31T12:00:00.000Z"),
      row("NEVER", null),
      row("STALE", "2026-08-01T12:00:00.000Z"),
    ], {
      now: "2026-09-01T12:00:00.000Z",
      maxBatch: 3,
      refreshAfterHours: 24,
    });

    expect(selected.map((item) => item.id)).toEqual(["NEVER", "STALE"]);
  });

  it("enforces hard batch bounds even when callers request too much work", () => {
    const candidates = Array.from({ length: 500 }, (_, index) => row(`T${index}`, null));
    const selected = selectScannerCandidates(candidates, {
      now: "2026-09-01T12:00:00.000Z",
      maxBatch: 9999,
      refreshAfterHours: 24,
    });

    expect(selected).toHaveLength(50);
  });

  it("does not rescan a security inside the freshness window", () => {
    const selected = selectScannerCandidates([
      row("A", "2026-09-01T11:30:00.000Z"),
      row("B", "2026-08-31T10:00:00.000Z"),
    ], {
      now: "2026-09-01T12:00:00.000Z",
      maxBatch: 10,
      refreshAfterHours: 24,
    });

    expect(selected.map((item) => item.id)).toEqual(["B"]);
  });
});
