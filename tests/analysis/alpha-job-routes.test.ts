import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const scanRoutePath = join(process.cwd(), "src/app/api/jobs/alpha/scan/run/route.ts");
const outcomesRoutePath = join(process.cwd(), "src/app/api/jobs/alpha/outcomes/run/route.ts");
const vercelPath = join(process.cwd(), "vercel.json");

function source(path: string): string {
  return readFileSync(path, "utf8");
}

describe("Alpha server-owned job routes", () => {
  it("wires the universe scanner behind the existing cron authorization boundary", () => {
    expect(existsSync(scanRoutePath)).toBe(true);
    if (!existsSync(scanRoutePath)) return;

    const route = source(scanRoutePath);
    expect(route).toContain('from "@/lib/alpha/scanner"');
    expect(route).toContain('from "@/lib/server/cron-auth"');
    expect(route).toContain("runAlphaUniverseScan");
    expect(route).toContain("getServerEnv().CRON_SECRET");
    expect(route).toContain("isCronAuthorized");
    expect(route).toContain('export const runtime = "nodejs"');
    expect(route).toContain("export const maxDuration = 300");
    expect(route).toMatch(/status:\s*401/);
    expect(route).toMatch(/status:\s*503/);
    expect(route).toContain("export const GET = run");
    expect(route).toContain("export const POST = run");
    expect(route).not.toMatch(/persistAnalysis|analysis_quota|reserveAnalysis|@\/lib\/affiliate\/payouts/);
  });

  it("wires matured outcome collection behind the same server-only boundary", () => {
    expect(existsSync(outcomesRoutePath)).toBe(true);
    if (!existsSync(outcomesRoutePath)) return;

    const route = source(outcomesRoutePath);
    expect(route).toContain('from "@/lib/alpha/outcome-collector"');
    expect(route).toContain('from "@/lib/server/cron-auth"');
    expect(route).toContain("collectMaturedAlphaOutcomes");
    expect(route).toContain("getServerEnv().CRON_SECRET");
    expect(route).toContain("isCronAuthorized");
    expect(route).toContain('export const runtime = "nodejs"');
    expect(route).toContain("export const maxDuration = 300");
    expect(route).toMatch(/status:\s*401/);
    expect(route).toMatch(/status:\s*503/);
    expect(route).toContain("export const GET = run");
    expect(route).toContain("export const POST = run");
    expect(route).not.toMatch(/persistAnalysis|analysis_quota|reserveAnalysis|@\/lib\/affiliate\/payouts/);
  });

  it("schedules both Alpha maintenance jobs without replacing existing Vercel crons", () => {
    const config = JSON.parse(source(vercelPath)) as {
      crons?: Array<{ path?: string; schedule?: string }>;
    };
    const crons = config.crons ?? [];

    expect(crons).toEqual(expect.arrayContaining([
      { path: "/api/monitoring/run", schedule: "30 5 * * *" },
      { path: "/api/affiliate/payouts/run", schedule: "0 7 1 * *" },
      { path: "/api/jobs/batch/run", schedule: "15 4 * * *" },
      { path: "/api/jobs/alpha/scan/run", schedule: "20 2 * * 1-5" },
      { path: "/api/jobs/alpha/outcomes/run", schedule: "0 3 * * 1-5" },
    ]));
  });
});
