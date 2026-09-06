import { afterEach, describe, expect, it, vi } from "vitest";
import { runPaperCompetitionValuationRuntimeV3 } from "../../src/lib/paper-trading/competition-valuation-runtime-v3";

const ENV_KEYS = [
  "FEATURE_PAPERTRADING",
  "FEATURE_LEADERBOARDS",
  "FEATURE_CHALLENGES",
  "FEATURE_PRIVATELEAGUES",
  "KILL_SWITCH_PAPERTRADING",
  "KILL_SWITCH_BACKGROUNDJOBS",
] as const;
const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = originalEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.restoreAllMocks();
});

function enableRuntime() {
  process.env.FEATURE_PAPERTRADING = "true";
  process.env.FEATURE_LEADERBOARDS = "true";
  process.env.FEATURE_CHALLENGES = "true";
  process.env.FEATURE_PRIVATELEAGUES = "true";
  delete process.env.KILL_SWITCH_PAPERTRADING;
  delete process.env.KILL_SWITCH_BACKGROUNDJOBS;
}

function aggregate(overrides: Partial<Record<"attempted" | "verified" | "unavailable" | "throttled" | "disabled" | "killed" | "errors", number>> = {}) {
  return {
    status: "COMPLETED" as const,
    attempted: 1,
    verified: 1,
    unavailable: 0,
    throttled: 0,
    disabled: 0,
    killed: 0,
    errors: 0,
    ...overrides,
  };
}

describe("Paper Trading V3 competition valuation runtime orchestration", () => {
  it("is dark by default and performs no lifecycle, candidate or provider work", async () => {
    for (const key of ENV_KEYS) delete process.env[key];
    const completeDue = vi.fn();
    const runActive = vi.fn();
    const runFinal = vi.fn();

    expect(await runPaperCompetitionValuationRuntimeV3({ completeDue, runActive, runFinal })).toEqual({ status: "DISABLED" });
    expect(completeDue).not.toHaveBeenCalled();
    expect(runActive).not.toHaveBeenCalled();
    expect(runFinal).not.toHaveBeenCalled();
  });

  it("fails closed under paper-trading or background-job kill switches before any lifecycle mutation", async () => {
    enableRuntime();
    process.env.KILL_SWITCH_PAPERTRADING = "true";
    const first = { completeDue: vi.fn(), runActive: vi.fn(), runFinal: vi.fn() };
    expect(await runPaperCompetitionValuationRuntimeV3(first)).toEqual({ status: "KILLED" });
    expect(first.completeDue).not.toHaveBeenCalled();
    expect(first.runActive).not.toHaveBeenCalled();
    expect(first.runFinal).not.toHaveBeenCalled();

    enableRuntime();
    process.env.KILL_SWITCH_BACKGROUNDJOBS = "true";
    const second = { completeDue: vi.fn(), runActive: vi.fn(), runFinal: vi.fn() };
    expect(await runPaperCompetitionValuationRuntimeV3(second)).toEqual({ status: "KILLED" });
    expect(second.completeDue).not.toHaveBeenCalled();
    expect(second.runActive).not.toHaveBeenCalled();
    expect(second.runFinal).not.toHaveBeenCalled();
  });

  it("completes expired competitions before any active or final valuation work", async () => {
    enableRuntime();
    const order: string[] = [];
    const completeDue = vi.fn(async () => {
      order.push("complete");
      return { ok: true as const, completed: 2 };
    });
    const runActive = vi.fn(async () => {
      order.push("active");
      return aggregate({ attempted: 2, verified: 2 });
    });
    const runFinal = vi.fn(async () => {
      order.push("final");
      return aggregate({ attempted: 2, verified: 1, unavailable: 1 });
    });

    const result = await runPaperCompetitionValuationRuntimeV3({ completeDue, runActive, runFinal });

    expect(order).toEqual(["complete", "active", "final"]);
    expect(result).toEqual({
      status: "COMPLETED",
      completedCompetitions: 2,
      active: aggregate({ attempted: 2, verified: 2 }),
      final: aggregate({ attempted: 2, verified: 1, unavailable: 1 }),
      errors: 0,
    });
  });

  it("fails closed before all provider work if completion authority fails", async () => {
    enableRuntime();
    const runActive = vi.fn();
    const runFinal = vi.fn();

    expect(await runPaperCompetitionValuationRuntimeV3({
      completeDue: async () => ({ ok: false as const, error: "PAPER_COMPETITION_COMPLETION_FAILED" as const }),
      runActive,
      runFinal,
    })).toEqual({ status: "ERROR" });
    expect(runActive).not.toHaveBeenCalled();
    expect(runFinal).not.toHaveBeenCalled();
  });

  it("isolates active and final sweeps so one runtime failure does not suppress the other", async () => {
    enableRuntime();
    const runFinal = vi.fn(async () => aggregate({ attempted: 1, verified: 1 }));

    const result = await runPaperCompetitionValuationRuntimeV3({
      completeDue: async () => ({ ok: true as const, completed: 1 }),
      runActive: async () => { throw new Error("active unavailable"); },
      runFinal,
    });

    expect(runFinal).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      status: "COMPLETED",
      completedCompetitions: 1,
      active: { status: "ERROR" },
      final: aggregate({ attempted: 1, verified: 1 }),
      errors: 1,
    });
  });

  it("returns only aggregate runtime data and rolls nested sweep errors into the top-level error count", async () => {
    enableRuntime();
    const result = await runPaperCompetitionValuationRuntimeV3({
      completeDue: async () => ({ ok: true as const, completed: 0 }),
      runActive: async () => aggregate({ attempted: 2, verified: 1, errors: 1 }),
      runFinal: async () => aggregate({ attempted: 2, verified: 0, unavailable: 1, errors: 1 }),
    });

    expect(result.status).toBe("COMPLETED");
    expect(result).toMatchObject({ errors: 2 });
    expect(JSON.stringify(result)).not.toContain("competitionId");
    expect(JSON.stringify(result)).not.toContain("accountId");
    expect(JSON.stringify(result)).not.toContain("userId");
  });
});
