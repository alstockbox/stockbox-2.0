import { describe, expect, it } from "vitest";
import { parseBatchInput } from "../../src/lib/batch/input";

describe("batch input long exchange-qualified symbols", () => {
  it("accepts the long fund ticker used by the exact global audit corpus", () => {
    const parsed = parseBatchInput("XACT-OBLIGATION.ST");

    expect(parsed.symbols).toEqual(["XACT-OBLIGATION.ST"]);
    expect(parsed.invalid).toEqual([]);
  });
});
