import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(join(process.cwd(), "src/app/affiliate/page.tsx"), "utf8");

describe("affiliate dashboard page", () => {
  it("shows core acquisition and earnings metrics", () => {
    expect(page).toContain("Lifetime earnings");
    expect(page).toContain("Paying customers");
    expect(page).toContain("Available");
    expect(page).toContain("Pending");
  });

  it("supports safe admin preview without session impersonation", () => {
    expect(page).toContain("Admin preview");
    expect(page).toContain("previewTargetId");
  });

  it("shows the affiliate link and payout history", () => {
    expect(page).toContain("Your affiliate link");
    expect(page).toContain("Payout history");
  });

  it("does not expose broken Connect onboarding when the launch gate is off", () => {
    expect(page).toContain("connectOnboardingEnabled");
    expect(page).toContain("Referral tracking and commissions remain active.");
    expect(page).toContain("connectOnboardingEnabled && !previewTargetId");
  });
});