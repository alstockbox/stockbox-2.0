import { describe, expect, it } from "vitest";

import { isUuid } from "./runtime";

describe("isUuid", () => {
  it("accepts canonical UUIDs used by acq_content ids", () => {
    expect(isUuid("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
    expect(isUuid("550E8400-E29B-41D4-A716-446655440000")).toBe(true);
  });

  it("rejects legacy or external utm_content values before UUID queries", () => {
    expect(isUuid("step2")).toBe(false);
    expect(isUuid("campaign-demo")).toBe(false);
    expect(isUuid("")).toBe(false);
    expect(isUuid(null)).toBe(false);
    expect(isUuid(undefined)).toBe(false);
  });

  it("rejects malformed UUID-looking values", () => {
    expect(isUuid("550e8400-e29b-41d4-a716-44665544000")).toBe(false);
    expect(isUuid("550e8400e29b41d4a716446655440000")).toBe(false);
  });
});
