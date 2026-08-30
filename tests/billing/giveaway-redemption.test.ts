import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "../..");
const settingsAction = readFileSync(join(root, "src/app/settings/giveaway-actions.ts"), "utf8");
const routeAction = readFileSync(join(root, "src/app/redeem/[code]/actions.ts"), "utf8");
const settings = readFileSync(join(root, "src/app/settings/page.tsx"), "utf8");

for (const [name, action] of [["settings", settingsAction], ["redeem route", routeAction]] as const) {
  describe(`${name} giveaway redemption`, () => {
    it("redeems only through the trusted server client for the authenticated user", () => {
      expect(action).toContain("const user = await requireUser()");
      expect(action).toContain("createAdminClient()");
      expect(action).toContain('rpc("redeem_affiliate_giveaway_code"');
      expect(action).toContain("p_user_id: user.id");
      expect(action).not.toContain('from("subscriptions")');
      expect(action).not.toContain("stripe");
    });
  });
}

describe("giveaway redemption UI", () => {
  it("keeps the settings redemption form available", () => {
    expect(settings).toContain("Redeem giveaway code");
  });
});
