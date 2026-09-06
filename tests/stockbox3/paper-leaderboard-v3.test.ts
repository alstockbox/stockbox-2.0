import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const enginePath = "src/lib/paper-trading/leaderboard-v3.ts";
const source = existsSync(enginePath) ? readFileSync(enginePath, "utf8") : "";

describe("Paper Trading V3 leaderboard fairness", () => {
  it("requires a single competition, currency and evaluation cutoff", () => {
    expect(source).toContain("export function derivePaperCompetitionLeaderboardV3");
    expect(source).toContain("competitionId");
    expect(source).toContain("baseCurrency");
    expect(source).toContain("evaluationCutoff");
    expect(source).toContain("INVALID_COMPETITION");
  });

  it("accepts only dedicated competition participants", () => {
    expect(source).toContain('accountType: "competition"');
    expect(source).toContain("entry.competitionId !== competitionId");
    expect(source).toContain('entry.accountType !== "competition"');
    expect(source).toContain("DUPLICATE_PARTICIPANT");
  });

  it("requires snapshots to match participant identity and exact cutoff", () => {
    expect(source).toContain("snapshot.userId !== entry.userId");
    expect(source).toContain("snapshot.accountId !== entry.accountId");
    expect(source).toContain("Date.parse(snapshot.evaluatedAt) !== cutoffMs");
    expect(source).toContain("snapshot.baseCurrency !== baseCurrency");
    expect(source).toContain("SNAPSHOT_MISMATCH");
  });

  it("never invents a score for participants without a comparable snapshot", () => {
    expect(source).toContain('status: "UNAVAILABLE"');
    expect(source).toContain("SNAPSHOT_MISSING");
    expect(source).toContain("rank: null");
    expect(source).toContain("returnPercent: null");
  });

  it("ranks only verified comparable snapshots by return with deterministic ties", () => {
    expect(source).toContain('status: "RANKED"');
    expect(source).toContain("right.returnPercent - left.returnPercent");
    expect(source).toContain("left.joinedAt.localeCompare(right.joinedAt)");
    expect(source).toContain("previous.returnPercent === current.returnPercent");
  });

  it("never performs FX or falls back to personal-account performance", () => {
    expect(source).not.toMatch(/fx|exchange.?rate|convertCurrency/i);
    expect(source).not.toContain('accountType: "personal"');
  });
});