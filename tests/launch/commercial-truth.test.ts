import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { commerciallyActivePlans } from "../../src/lib/billing/plans";

const root = process.cwd();
const read = (path: string) => readFileSync(`${root}/${path}`, "utf8");
const deferredEntitlementsMigration = "supabase/migrations/20260830214500_disable_deferred_plan_entitlements.sql";

describe("commercial launch truth", () => {
  it("does not advertise deferred AI assistant or hourly alert entitlements", () => {
    const paid = commerciallyActivePlans.filter((plan) => plan.key !== "free");
    for (const plan of paid) {
      expect(plan.entitlements.aiAssistant, `${plan.name} aiAssistant`).toBe(false);
      expect(plan.entitlements.hourlyAlerts, `${plan.name} hourlyAlerts`).toBe(false);
    }
  });

  it("persists the deferred entitlement state in the database catalog", () => {
    expect(existsSync(`${root}/${deferredEntitlementsMigration}`)).toBe(true);
    const sql = read(deferredEntitlementsMigration).replace(/\s+/g, " ").toLowerCase();
    expect(sql).toContain("where key in ('standard', 'premium', 'elite')");
    expect(sql).toContain("'{aiassistant}'");
    expect(sql).toContain("'{hourlyalerts}'");
    expect(sql.match(/'false'::jsonb/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it("derives legal pricing disclosure from every active paid plan", () => {
    const terms = read("src/app/legal/terms/page.tsx");
    expect(terms).toContain("commerciallyActivePlans");
    expect(terms).toContain("paidPlans.map");
    expect(terms).not.toContain('findPlan("basic")');
    for (const name of ["Basic", "Standard", "Pro", "Elite"]) expect(terms).not.toContain(`${name} costs`);
  });
});
