import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const actions = readFileSync(join(process.cwd(), "src/lib/auth/actions.ts"), "utf8");

describe("signup referral wiring", () => {
  it("reads the referral cookie server-side and writes the payout-model referral", () => {
    expect(actions).toContain('cookieStore.get("stockbox_ref")');
    expect(actions).toContain('"record_affiliate_referral"');
    expect(actions).toContain('p_referred_id: data.user.id');
    expect(actions).toContain('cookieStore.delete("stockbox_ref")');
  });
});
