import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { runPaperCompetitionValuationSweepV3 } from "../../src/lib/paper-trading/competition-valuation-sweep-v3";

const source = fs.readFileSync(
  path.join(process.cwd(), "src/lib/paper-trading/competition-valuation-sweep-v3.ts"),
  "utf8",
);

describe("Paper Trading V3 lifecycle preflight in valuation sweep", () => {
  it("wires the lifecycle reconciler behind valuation feature and kill-switch authority", () => {
    expect(source).toContain("reconcilePaperCompetitionLifecycleV3");
    expect(source).toContain('isFeatureEnabled("paperTrading")');
    expect(source).toContain('isFeatureEnabled("leaderboards")');
    expect(source).toContain('isFeatureEnabled("challenges")');
    expect(source).toContain('isFeatureEnabled("privateLeagues")');
    expect(source).toContain('isKilled("paperTrading")');
    expect(source).toContain('isKilled("backgroundJobs")');
  });

  it("reconciles lifecycle before loading due candidates when background valuation is enabled", async () => {
    const reconcileLifecycle = vi.fn(async () => ({ ok: true as const, activated: 1 }));
    const loadCandidates = vi.fn(async () => ({ ok: true as const, competitionIds: [] }));
    const runCompetition = vi.fn();

    const result = await runPaperCompetitionValuationSweepV3({
      lifecycleEnabled: () => true,
      reconcileLifecycle,
      loadCandidates,
      runCompetition,
    } as Parameters<typeof runPaperCompetitionValuationSweepV3>[0]);

    expect(result).toEqual({
      status: "COMPLETED",
      attempted: 0,
      verified: 0,
      unavailable: 0,
      throttled: 0,
      disabled: 0,
      killed: 0,
      errors: 0,
    });
    expect(reconcileLifecycle).toHaveBeenCalledTimes(1);
    expect(loadCandidates).toHaveBeenCalledTimes(1);
    expect(reconcileLifecycle.mock.invocationCallOrder[0]).toBeLessThan(loadCandidates.mock.invocationCallOrder[0]);
  });

  it("fails closed before candidate lookup when lifecycle reconciliation is unavailable", async () => {
    const reconcileLifecycle = vi.fn(async () => ({ ok: false as const, error: "db unavailable" }));
    const loadCandidates = vi.fn();
    const runCompetition = vi.fn();

    expect(await runPaperCompetitionValuationSweepV3({
      lifecycleEnabled: () => true,
      reconcileLifecycle,
      loadCandidates,
      runCompetition,
    } as Parameters<typeof runPaperCompetitionValuationSweepV3>[0])).toEqual({ status: "ERROR" });
    expect(loadCandidates).not.toHaveBeenCalled();
    expect(runCompetition).not.toHaveBeenCalled();
  });

  it("does not mutate lifecycle when valuation features are dark or a kill switch blocks background work", async () => {
    const reconcileLifecycle = vi.fn();
    const loadCandidates = vi.fn(async () => ({ ok: true as const, competitionIds: [] }));

    await runPaperCompetitionValuationSweepV3({
      lifecycleEnabled: () => false,
      reconcileLifecycle,
      loadCandidates,
      runCompetition: vi.fn(),
    } as Parameters<typeof runPaperCompetitionValuationSweepV3>[0]);

    expect(reconcileLifecycle).not.toHaveBeenCalled();
    expect(loadCandidates).toHaveBeenCalledTimes(1);
  });
});
