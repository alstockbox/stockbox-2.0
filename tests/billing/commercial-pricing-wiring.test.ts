import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "../..");
const pricing = readFileSync(join(root, "src/app/pricing/page.tsx"), "utf8");
const webhook = readFileSync(join(root, "src/app/api/stripe/webhook/route.ts"), "utf8");

describe("commercial pricing release wiring", () => {
  it("sends each pricing card's actual plan into Checkout", () => {
    expect(pricing).toContain('plan={plan.key}');
    expect(pricing).not.toContain('plan="basic"');
  });

  it("visually marks the configured highlighted plan", () => {
    expect(pricing).toContain("plan.highlight");
    expect(pricing).toContain("copy.mostPopular");
  });

  it("recognizes launch redemption metadata for every launch-enabled paid plan", () => {
    expect(webhook).not.toContain('subscription.metadata.offer === "basic_launch_3_months"');
    expect(webhook).toContain('subscription.metadata.offer !== "none"');
  });
});
