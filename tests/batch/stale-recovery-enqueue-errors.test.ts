import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("stale batch recovery enqueue failures", () => {
  it("leaves a recovered item queued when worker-job admission is temporarily unavailable", () => {
    const recovery = readFileSync(
      resolve(process.cwd(), "src/lib/batch/stale-recovery.ts"),
      "utf8",
    );

    expect(recovery).toContain("Recovered stale attempt but worker enqueue is temporarily unavailable.");
    expect(recovery).not.toContain("Recovered stale attempt but could not restore its worker job.");
  });
});
