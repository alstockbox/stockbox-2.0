import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationsDir = join(process.cwd(), "supabase/migrations");
const migrationSql = () => readdirSync(migrationsDir)
  .filter((file) => file.endsWith(".sql"))
  .sort()
  .map((file) => readFileSync(join(migrationsDir, file), "utf8"))
  .join("\n")
  .replace(/\s+/g, " ")
  .toLowerCase();

describe("Stripe webhook ordering", () => {
  it("persists Stripe event identity and ordering metadata", () => {
    const sql = migrationSql();
    expect(sql).toContain("last_stripe_event_id");
    expect(sql).toContain("last_stripe_event_created");
    expect(sql).toContain("sync_subscription_from_stripe");
  });

  it("ignores duplicate and older events inside the database mutation", () => {
    const sql = migrationSql();
    expect(sql).toContain("p_event_id");
    expect(sql).toContain("p_event_created");
    expect(sql).toContain("last_stripe_event_id = excluded.last_stripe_event_id");
    expect(sql).toMatch(/p_event_created\s*<\s*coalesce\(/);
  });

  it("does not let an old subscription deletion replace a newer subscription", () => {
    const sql = migrationSql();
    expect(sql).toContain("p_stripe_subscription_id");
    expect(sql).toContain("customer.subscription.deleted");
    expect(sql).toContain("stale_subscription");
  });

  it("routes event ordering metadata through the atomic RPC", () => {
    const route = readFileSync(
      join(process.cwd(), "src/app/api/stripe/webhook/route.ts"),
      "utf8"
    );
    expect(route).toContain('rpc("sync_subscription_from_stripe"');
    expect(route).toContain("p_event_id: eventId");
    expect(route).toContain("p_event_created: eventCreated");
    expect(route).toContain("p_subscription_created: subscription.created");
    expect(route).toContain("event.id");
    expect(route).toContain("event.created");
  });
});
