import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  batchJobDedupeKey,
  deriveBatchRunStatus,
  shouldRetryBatchFailure,
} from "@/lib/batch/durable";

describe("durable batch state", () => {
  it("uses a stable per-item dedupe key", () => {
    expect(batchJobDedupeKey("abc")).toBe("batch:item:abc");
  });

  it("does not requeue permanent entitlement failures", () => {
    expect(shouldRetryBatchFailure({ attempts: 1, maxAttempts: 4 }, new Error("Monthly analysis limit reached."))).toBe(false);
    expect(shouldRetryBatchFailure({ attempts: 4, maxAttempts: 4 }, new Error("Transient provider failure"))).toBe(false);
    expect(shouldRetryBatchFailure({ attempts: 2, maxAttempts: 4 }, new Error("Transient provider failure"))).toBe(true);
  });

  it("rate-limits batch creation and rejects duplicate company identities", () => {
    const route = readFileSync(resolve(process.cwd(), "src/app/api/batch/runs/route.ts"), "utf8");
    expect(route).toContain('clientRateLimitKey(request, "batch-create", user.id)');
    expect(route).toContain("new Set(companyKeys).size !== companyKeys.length");
  });

  it("derives terminal run status from item counts", () => {
    expect(deriveBatchRunStatus({ total: 3, queued: 3, processing: 0, completed: 0, failed: 0, cancelled: 0 })).toBe("queued");
    expect(deriveBatchRunStatus({ total: 3, queued: 1, processing: 1, completed: 1, failed: 0, cancelled: 0 })).toBe("processing");
    expect(deriveBatchRunStatus({ total: 3, queued: 0, processing: 0, completed: 3, failed: 0, cancelled: 0 })).toBe("completed");
    expect(deriveBatchRunStatus({ total: 3, queued: 0, processing: 0, completed: 2, failed: 1, cancelled: 0 })).toBe("partial");
    expect(deriveBatchRunStatus({ total: 3, queued: 0, processing: 0, completed: 0, failed: 3, cancelled: 0 })).toBe("failed");
  });
  it("does not retry deterministic permanent batch failures", () => {
    const job = { attempts: 1, maxAttempts: 4 };
    expect(shouldRetryBatchFailure(job, new Error("Monthly analysis limit reached."))).toBe(false);
    expect(shouldRetryBatchFailure(job, new Error("Batch analysis idempotency conflict."))).toBe(false);
    expect(shouldRetryBatchFailure(job, new Error("Live fundamentals are unavailable for this security."))).toBe(false);
    expect(shouldRetryBatchFailure(job, new Error("Provider analysis failed."))).toBe(true);
  });

});
