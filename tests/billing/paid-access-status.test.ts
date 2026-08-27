import { describe, expect, it } from "vitest";
import { hasPaidAccessStatus } from "../../src/lib/billing/subscriptions";

describe("paid subscription access status", () => {
  it.each([
    ["active", true],
    ["trialing", true],
    ["past_due", false],
    ["unpaid", false],
    ["incomplete", false],
    ["paused", false],
    ["canceled", false],
    ["incomplete_expired", false],
  ] as const)("maps %s to paid access = %s", (status, expected) => {
    expect(hasPaidAccessStatus(status)).toBe(expected);
  });
});
