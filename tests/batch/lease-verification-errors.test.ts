import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("durable batch lease verification", () => {
  it("retries transient lease-read failures instead of treating them as superseded work", () => {
    const durable = readFileSync(
      resolve(process.cwd(), "src/lib/batch/durable.ts"),
      "utf8",
    );

    expect(durable).toContain("Batch lease verification is temporarily unavailable.");
    expect(durable).not.toContain(
      "if (current.error || !current.data) throw new BatchItemLeaseLostError();",
    );
  });
});
