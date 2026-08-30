import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(join(process.cwd(), "src/app/affiliate/page.tsx"), "utf8");
const buttonPath = join(process.cwd(), "src/components/affiliate/connect-payout-button.tsx");

describe("affiliate dashboard payout actions", () => {
  it("offers Stripe payout setup only outside admin preview", () => {
    expect(page).toContain("ConnectPayoutButton");
    expect(page).toContain("!previewTargetId");
    expect(page).toContain("data.payoutEnabled");
  });

  it("opens Stripe-hosted onboarding from the connect endpoint", () => {
    const button = readFileSync(buttonPath, "utf8");
    expect(button).toContain('fetch("/api/affiliate/connect"');
    expect(button).toContain("window.location.assign(payload.url)");
    expect(button).toContain("Set up payouts");
  });
});
