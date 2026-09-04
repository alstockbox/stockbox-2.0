import { describe, expect, it } from "vitest";
import { buildGrowthAssetPath } from "../src/lib/growth/asset-paths";

describe("buildGrowthAssetPath", () => {
  it("creates deterministic ID-only growth asset paths", () => {
    expect(
      buildGrowthAssetPath({
        date: "2026-09-04",
        contentId: "content_123",
        renderJobId: "job_456",
        kind: "master_video",
        extension: "mp4",
      }),
    ).toBe("2026-09-04/content_123/job_456/master_video.mp4");
  });

  it("rejects traversal and unsafe path segments", () => {
    expect(() =>
      buildGrowthAssetPath({
        date: "2026-09-04",
        contentId: "../secret",
        renderJobId: "job_456",
        kind: "voice_audio",
        extension: "wav",
      }),
    ).toThrow();

    expect(() =>
      buildGrowthAssetPath({
        date: "2026-09-04",
        contentId: "content_123",
        renderJobId: "job/456",
        kind: "master_video",
        extension: "mp4",
      }),
    ).toThrow();
  });

  it("rejects invalid dates and unapproved extensions", () => {
    expect(() =>
      buildGrowthAssetPath({
        date: "04-09-2026",
        contentId: "content_123",
        renderJobId: "job_456",
        kind: "metadata",
        extension: "json",
      }),
    ).toThrow();

    expect(() =>
      buildGrowthAssetPath({
        date: "2026-09-04",
        contentId: "content_123",
        renderJobId: "job_456",
        kind: "payload",
        extension: "exe" as never,
      }),
    ).toThrow();
  });
});
