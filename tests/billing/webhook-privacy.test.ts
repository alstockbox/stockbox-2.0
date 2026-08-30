import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "../..");
const source = readFileSync(join(root, "src/app/api/stripe/webhook/route.ts"), "utf8");

describe("billing webhook log privacy", () => {
  it("does not put customer, user or subscription identifiers in console error contexts", () => {
    const errorCalls = source.match(/console\.error\([\s\S]*?\);/g) ?? [];
    const loggedSource = errorCalls.join("\n");
    expect(loggedSource).not.toContain("userId:");
    expect(loggedSource).not.toContain("subscriptionId:");
    expect(loggedSource).not.toContain("stripePriceId:");
  });
});
