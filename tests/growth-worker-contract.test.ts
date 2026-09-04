import { describe, expect, it } from "vitest";
import {
  decideRenderFailure,
  validateCompletionPayload,
  validateUsageEntries,
  validateWorkerToken,
} from "../src/lib/growth/worker-contract";

describe("growth worker contract", () => {
  it("rejects an invalid raw worker token", () => {
    expect(validateWorkerToken("wrong", "correct")).toBe(false);
    expect(validateWorkerToken("correct", "correct")).toBe(true);
  });

  it("does not allow READY when QC failed", () => {
    expect(() =>
      validateCompletionPayload({
        qcPassed: false,
        contentId: "content-1",
        renderJobId: "job-1",
        assets: [],
      }),
    ).toThrow(/qc/i);
  });

  it("requires master video and cover with checksums under the expected prefix", () => {
    const prefix = "2026-09-04/content-1/job-1/";
    expect(
      validateCompletionPayload({
        qcPassed: true,
        contentId: "content-1",
        renderJobId: "job-1",
        expectedPrefix: prefix,
        assets: [
          {
            kind: "master_video",
            bucket: "growth-ready-assets",
            storagePath: `${prefix}master.mp4`,
            checksumSha256: "a".repeat(64),
          },
          {
            kind: "cover",
            bucket: "growth-ready-assets",
            storagePath: `${prefix}cover.jpg`,
            checksumSha256: "b".repeat(64),
          },
        ],
      }).ready,
    ).toBe(true);
  });

  it("accepts finite non-negative provider usage", () => {
    expect(validateUsageEntries([
      { idempotencyKey: "job-1:voice", provider: "voice-worker", operation: "voice_sv", estimatedSek: 0.2, actualSek: 0.18 },
      { idempotencyKey: "job-1:gen:s3", provider: "gen-video", operation: "micro_scene", estimatedSek: 0.4, actualSek: 0.4 },
    ])).toHaveLength(2);
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])("rejects invalid usage estimated cost %s", (value) => {
    expect(() => validateUsageEntries([{ idempotencyKey: "x", provider: "p", operation: "o", estimatedSek: value }])).toThrow(/cost/i);
  });

  it("rejects negative actual provider spend", () => {
    expect(() => validateUsageEntries([{ idempotencyKey: "x", provider: "p", operation: "o", estimatedSek: 0.1, actualSek: -0.1 }])).toThrow(/cost/i);
  });

  it("requeues retryable failures below max attempts and fails exhausted jobs", () => {
    expect(decideRenderFailure({ attemptCount: 1, maxAttempts: 2, retryable: true })).toBe("queued");
    expect(decideRenderFailure({ attemptCount: 2, maxAttempts: 2, retryable: true })).toBe("failed");
    expect(decideRenderFailure({ attemptCount: 1, maxAttempts: 2, retryable: false })).toBe("failed");
  });
});