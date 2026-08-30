import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const root = join(import.meta.dirname, "../..");
const action = readFileSync(join(root, "src/app/settings/giveaway-actions.ts"), "utf8");
const settings = readFileSync(join(root, "src/app/settings/page.tsx"), "utf8");

describe("giveaway redemption UI", () => {
  it("redeems through the authenticated RPC and does not mutate subscriptions", () => {
    expect(action).toContain("await requireUser()");
    expect(action).toContain('rpc("redeem_affiliate_giveaway_code"');
    expect(action).not.toContain('from("subscriptions")');
    expect(action).not.toContain("stripe");
    expect(settings).toContain("Redeem giveaway code");
  });
});
