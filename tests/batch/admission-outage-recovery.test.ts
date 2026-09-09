import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("durable batch admission outages", () => {
  it("keeps newly created and manually retried items queued when worker admission is temporarily unavailable", () => {
    const durable = readFileSync(
      resolve(process.cwd(), "src/lib/batch/durable.ts"),
      "utf8",
    );

    const failureBlocks = [...durable.matchAll(
      /if \(outcome\.ok\) return true;\n([\s\S]*?)\n\s*return false;/g,
    )].map((match) => match[1]);

    expect(failureBlocks).toHaveLength(2);
    for (const block of failureBlocks) {
      expect(block).not.toContain('status: "failed"');
      expect(block).not.toContain("completed_at:");
    }

    expect(durable).toContain("Batch worker enqueue is temporarily unavailable.");
    expect(durable).toContain("Batch retry worker enqueue is temporarily unavailable.");
    expect(durable).not.toContain('last_error: "Unable to enqueue batch analysis."');
    expect(durable).not.toContain('last_error: "Unable to enqueue batch analysis retry."');
  });
});
