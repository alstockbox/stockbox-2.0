import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const proxy = readFileSync(join(process.cwd(), "src/lib/supabase/proxy.ts"), "utf8");

describe("affiliate referral landing capture", () => {
  it("persists first-touch referral and a stable visitor token", () => {
    expect(proxy).toContain("normalizeReferralCode");
    expect(proxy).toContain("stockbox_ref");
    expect(proxy).toContain("stockbox_ref_visitor");
  });

  it("records a deduplicated click without blocking page load", () => {
    expect(proxy).toContain("affiliate_clicks");
    expect(proxy).toContain("ignoreDuplicates: true");
    expect(proxy).toContain("catch");
  });
});

describe("affiliate referral validation", () => {
  it("validates an active affiliate before persisting first touch", () => {
    expect(proxy).toContain("resolveActiveAffiliate");
    expect(proxy).toContain("await resolveActiveAffiliate(incomingCode)");
    const validation = proxy.indexOf("if (!affiliate) return");
    const cookieWrite = proxy.indexOf('response.cookies.set("stockbox_ref"');
    expect(validation).toBeGreaterThan(-1);
    expect(cookieWrite).toBeGreaterThan(validation);
  });
});
