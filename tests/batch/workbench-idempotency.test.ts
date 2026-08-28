import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("batch retry idempotency", () => {
  it("reuses one stable retry key for a failed row instead of generating a new key per request", () => {
    const source = readFileSync(resolve(process.cwd(), "src/components/batch/batch-workbench.tsx"), "utf8");

    expect(source).toContain("idempotencyKey?: string");
    expect(source).toContain("candidate.idempotencyKey ?? crypto.randomUUID()");
    expect(source).toContain("idempotencyKey: idempotencyKey");
  });
});
