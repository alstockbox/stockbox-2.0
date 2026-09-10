import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const helperPath = join(process.cwd(), "src/lib/server/cron-auth.ts");
const cronRoutes = [
  "src/app/api/jobs/alpha/scan/run/route.ts",
  "src/app/api/jobs/alpha/outcomes/run/route.ts",
  "src/app/api/jobs/batch/run/route.ts",
  "src/app/api/monitoring/run/route.ts",
].map((path) => join(process.cwd(), path));

function source(path: string): string {
  return readFileSync(path, "utf8");
}

describe("shared cron authorization boundary", () => {
  it("keeps non-affiliate cron routes independent from affiliate payout and Stripe code", () => {
    expect(existsSync(helperPath)).toBe(true);
    for (const routePath of cronRoutes) {
      const route = source(routePath);
      expect(route).toContain('from "@/lib/server/cron-auth"');
      expect(route).toContain("isCronAuthorized");
      expect(route).not.toContain("@/lib/affiliate/payouts");
    }
  });

  it("requires an exact Bearer secret and fails closed when the secret is unavailable", () => {
    expect(existsSync(helperPath)).toBe(true);
    if (!existsSync(helperPath)) return;

    const helper = source(helperPath);
    expect(helper).toContain("export function isCronAuthorized");
    expect(helper).toContain("Boolean(secret)");
    expect(helper).toContain('authorization === `Bearer ${secret}`');
  });
});
