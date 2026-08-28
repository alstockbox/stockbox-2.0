import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("affiliate dashboard", () => {
  it("shows only aggregate affiliate metrics and a shareable referral link", () => {
    const source = readFileSync(join(process.cwd(), "src/app/affiliate/page.tsx"), "utf8");
    expect(source).toContain('.from("affiliates")');
    expect(source).toContain('.from("affiliate_clicks")');
    expect(source).toContain('.from("affiliate_attributions")');
    expect(source).toContain("Clicks");
    expect(source).toContain("Signups");
    expect(source).toContain("Active Basic conversions");
    expect(source).toContain("Commission rate");
    expect(source).toContain("/r/${affiliate.code}");
    expect(source).not.toContain("referred_email");
  });

  it("adds an affiliate navigation entry for ambassadors", () => {
    const source = readFileSync(join(process.cwd(), "src/components/app-shell/nav.tsx"), "utf8");
    expect(source).toContain('href="/affiliate"');
    expect(source).toContain('user?.role === "affiliate_ambassador"');
  });
});