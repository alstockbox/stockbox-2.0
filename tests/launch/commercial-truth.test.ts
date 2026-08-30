import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { commerciallyActivePlans } from "../../src/lib/billing/plans";

const root = process.cwd();
const read = (path: string) => readFileSync(`${root}/${path}`, "utf8");

describe("commercial launch truth", () => {
  it("does not advertise deferred AI assistant or hourly alert entitlements", () => {
    const paid = commerciallyActivePlans.filter((plan) => plan.key !== "free");
    for (const plan of paid) {
      expect(plan.entitlements.aiAssistant, `${plan.name} aiAssistant`).toBe(false);
      expect(plan.entitlements.hourlyAlerts, `${plan.name} hourlyAlerts`).toBe(false);
    }
  });

  it("derives legal pricing disclosure from every active paid plan", () => {
    const terms = read("src/app/legal/terms/page.tsx");
    expect(terms).toContain("commerciallyActivePlans");
    expect(terms).toContain("paidPlans.map");
    expect(terms).not.toContain('findPlan("basic")');
    for (const name of ["Basic", "Standard", "Pro", "Elite"]) expect(terms).not.toContain(`${name} costs`);
  });
});
