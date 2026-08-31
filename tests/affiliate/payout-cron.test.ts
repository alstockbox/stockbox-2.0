import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isPayoutCronAuthorized } from "@/lib/affiliate/payouts";

const routePath = join(process.cwd(), "src/app/api/affiliate/payouts/run/route.ts");
const vercelPath = join(process.cwd(), "vercel.json");

describe("affiliate payout automation", () => {
  it("requires the exact cron bearer secret", () => {
    expect(isPayoutCronAuthorized("Bearer secret", "secret")).toBe(true);
    expect(isPayoutCronAuthorized("Bearer wrong", "secret")).toBe(false);
    expect(isPayoutCronAuthorized(null, "secret")).toBe(false);
    expect(isPayoutCronAuthorized("Bearer secret", "")).toBe(false);
  });

  it("provides a secured scheduled payout route", () => {
    const route = readFileSync(routePath, "utf8");
    expect(route).toContain("CRON_SECRET");
    expect(route).toContain("runScheduledAffiliatePayouts");
    expect(route).toContain("requireAdmin");
  });

  it("schedules the payout sweep monthly", () => {
    const config = readFileSync(vercelPath, "utf8");
    expect(config).toContain('"/api/affiliate/payouts/run"');
    expect(config).toContain('"0 7 1 * *"');
  });
});
