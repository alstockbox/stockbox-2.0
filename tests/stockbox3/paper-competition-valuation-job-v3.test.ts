import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  parsePaperCompetitionValuationJobInputV3,
  runPaperCompetitionValuationJobV3,
} from "../../src/lib/paper-trading/competition-valuation-job-v3";

const COMPETITION_ID = "11111111-1111-4111-8111-111111111111";
const routePath = "src/app/api/jobs/paper-competition-valuation/run/route.ts";

describe("Paper Trading V3 competition valuation runtime job boundary", () => {
  it("accepts only an exact competitionId request and rejects caller authority fields", () => {
    expect(parsePaperCompetitionValuationJobInputV3({ competitionId: `  ${COMPETITION_ID}  ` })).toEqual({
      ok: true,
      input: { competitionId: COMPETITION_ID },
    });

    for (const input of [
      null,
      {},
      { competitionId: "not-a-uuid" },
      { competitionId: COMPETITION_ID, accountId: "browser-account" },
      { competitionId: COMPETITION_ID, viewerUserId: "browser-user" },
      { competitionId: COMPETITION_ID, evaluationCutoff: "1999-01-01T00:00:00.000Z" },
      { competitionId: COMPETITION_ID, serverNow: "1999-01-01T00:00:00.000Z" },
    ]) {
      expect(parsePaperCompetitionValuationJobInputV3(input)).toEqual({ ok: false, error: "INVALID_INPUT" });
    }
  });

  it("loads competition kind from trusted server state and dispatches challenge valuation with only competitionId", async () => {
    const loadCompetitionKind = vi.fn(async () => ({ ok: true as const, kind: "challenge" as const }));
    const runChallengeValuation = vi.fn(async () => ({ status: "THROTTLED" as const }));
    const runPrivateLeagueValuation = vi.fn(async () => ({ status: "THROTTLED" as const }));

    const result = await runPaperCompetitionValuationJobV3(
      { competitionId: COMPETITION_ID },
      { loadCompetitionKind, runChallengeValuation, runPrivateLeagueValuation },
    );

    expect(result).toEqual({ status: "THROTTLED" });
    expect(loadCompetitionKind).toHaveBeenCalledWith(COMPETITION_ID);
    expect(runChallengeValuation).toHaveBeenCalledWith({ competitionId: COMPETITION_ID });
    expect(runPrivateLeagueValuation).not.toHaveBeenCalled();
  });

  it("dispatches private leagues only from trusted kind evidence", async () => {
    const loadCompetitionKind = vi.fn(async () => ({ ok: true as const, kind: "private_league" as const }));
    const runChallengeValuation = vi.fn(async () => ({ status: "THROTTLED" as const }));
    const runPrivateLeagueValuation = vi.fn(async () => ({ status: "DISABLED" as const }));

    const result = await runPaperCompetitionValuationJobV3(
      { competitionId: COMPETITION_ID },
      { loadCompetitionKind, runChallengeValuation, runPrivateLeagueValuation },
    );

    expect(result).toEqual({ status: "DISABLED" });
    expect(runPrivateLeagueValuation).toHaveBeenCalledWith({ competitionId: COMPETITION_ID });
    expect(runChallengeValuation).not.toHaveBeenCalled();
  });

  it("fails closed when trusted kind evidence cannot be loaded", async () => {
    const loadCompetitionKind = vi.fn(async () => ({ ok: false as const, error: "NOT_FOUND" }));
    const runChallengeValuation = vi.fn();
    const runPrivateLeagueValuation = vi.fn();

    expect(await runPaperCompetitionValuationJobV3(
      { competitionId: COMPETITION_ID },
      { loadCompetitionKind, runChallengeValuation, runPrivateLeagueValuation },
    )).toEqual({ status: "ERROR" });
    expect(runChallengeValuation).not.toHaveBeenCalled();
    expect(runPrivateLeagueValuation).not.toHaveBeenCalled();
  });

  it("exposes only a secured POST runtime route and no browser-controlled valuation authority", () => {
    expect(existsSync(routePath)).toBe(true);
    const route = readFileSync(routePath, "utf8");
    expect(route).toContain('export const runtime = "nodejs"');
    expect(route).toContain("CRON_SECRET");
    expect(route).toContain("isPayoutCronAuthorized");
    expect(route).toContain("parsePaperCompetitionValuationJobInputV3");
    expect(route).toContain("runPaperCompetitionValuationJobV3");
    expect(route).toContain("request.json()");
    expect(route).toContain("export async function POST");
    expect(route).not.toContain("export const GET");
    expect(route).not.toContain("accountId");
    expect(route).not.toContain("viewerUserId");
    expect(route).not.toContain("evaluationCutoff");
    expect(route).not.toContain("serverNow");
  });
});
