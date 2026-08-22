import { describe, expect, it } from "vitest";
import { dynamic } from "../../src/app/analyze/page";

describe("Analyze page rendering", () => {
  it("evaluates provider readiness dynamically for every request", () => {
    expect(dynamic).toBe("force-dynamic");
  });
});
