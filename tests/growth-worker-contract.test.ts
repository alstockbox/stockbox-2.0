import { describe, expect, it } from "vitest";
import {
  decideRenderFailure,
  validateCompletionPayload,
  validateWorkerToken,
} from "../src/lib/growth/worker-contract";

describe("growth worker contract", () => {
  it("rejects an invalid worker token", () => {
    expect(validateWorkerToken("Bearer wrong", "correct")).toBe(false);
    expect(validateWorkerToken("Bearer correct", "correct")).toBe(true);
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

  it("requeues retryable failures below max attempts and fails exhausted jobs", () => {
    expect(decideRenderFailure({ attemptCount: 1, maxAttempts: 2, retryable: true })).toBe("queued");
    expect(decideRenderFailure({ attemptCount: 2, maxAttempts: 2, retryable: true })).toBe("failed");
    expect(decideRenderFailure({ attemptCount: 1, maxAttempts: 2, retryable: false })).toBe("failed");
  });
});
