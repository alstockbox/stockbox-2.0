import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("affiliate dashboard", () => {
  it("shows aggregate metrics and uses the service layer for payout-model data", () => {
    const page = readFileSync(join(process.cwd(), "src/app/affiliate/page.tsx"), "utf8");
    const service = readFileSync(join(process.cwd(), "src/lib/affiliate/service.ts"), "utf8");
    expect(service).toContain('.from("affiliates")');
    expect(service).toContain('.from("affiliate_clicks")');
    expect(service).toContain('.from("referrals")');
    expect(service).toContain('.from("affiliate_commissions")');
    expect(page).toContain("Clicks");
    expect(page).toContain("Signups");
    expect(page).toContain("Paying customers");
    expect(page).toContain("Lifetime earnings");
    expect(page).toContain("commission on sales excluding VAT/tax");
    expect(page).not.toContain("referred_email");
  });

  it("adds an affiliate navigation entry for ambassadors", () => {
    const source = readFileSync(join(process.cwd(), "src/components/app-shell/nav.tsx"), "utf8");
    expect(source).toContain('href="/affiliate"');
    expect(source).toContain('user?.role === "affiliate_ambassador"');
  });
});
