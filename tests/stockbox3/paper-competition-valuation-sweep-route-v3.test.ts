import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const routePath = "src/app/api/jobs/paper-competition-valuation-sweep/run/route.ts";
const vercelPath = "vercel.json";

describe("Paper Trading V3 competition valuation runtime route", () => {
  it("exposes one CRON_SECRET-protected internal GET/POST route with no browser-controlled authority", () => {
    expect(existsSync(routePath)).toBe(true);
    const route = readFileSync(routePath, "utf8");

    expect(route).toContain('export const runtime = "nodejs"');
    expect(route).toContain("CRON_SECRET");
    expect(route).toContain("isPayoutCronAuthorized");
    expect(route).toContain("runPaperCompetitionValuationRuntimeV3");
    expect(route).not.toContain("runPaperCompetitionValuationSweepV3");
    expect(route).not.toContain("runPaperCompetitionFinalValuationSweepV3");
    expect(route).not.toContain("completeDuePaperCompetitionsV3");
    expect(route).toContain("export const GET = run");
    expect(route).toContain("export const POST = run");

    expect(route).not.toContain("request.json()");
    expect(route).not.toContain("competitionId");
    expect(route).not.toContain("accountId");
    expect(route).not.toContain("viewerUserId");
    expect(route).not.toContain("evaluationCutoff");
    expect(route).not.toContain("serverNow");
    expect(route).not.toContain("p_limit");
    expect(route).not.toContain("p_now");
  });

  it("fails closed on runtime failure and returns only aggregate orchestration data", () => {
    expect(existsSync(routePath)).toBe(true);
    const route = readFileSync(routePath, "utf8");

    expect(route).toContain('result.status === "ERROR"');
    expect(route).toContain('result.status === "COMPLETED"');
    expect(route).toContain("result.errors > 0");
    expect(route).toContain("503");
    expect(route).toContain("207");
    expect(route).toContain("Response.json(result");
    expect(route).not.toContain("competitionIds");
    expect(route).not.toContain("reason:");
  });

  it("does not activate a production cron schedule as part of route wiring", () => {
    const vercel = readFileSync(vercelPath, "utf8");
    expect(vercel).not.toContain("/api/jobs/paper-competition-valuation-sweep/run");
  });
});
