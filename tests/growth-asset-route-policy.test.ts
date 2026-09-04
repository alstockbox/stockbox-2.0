import { describe, expect, it } from "vitest";
import { resolveGrowthAssetAccess } from "@/lib/growth/asset-access";

const goodAsset = {
  id: "asset-1",
  kind: "master_video",
  bucket: "growth-ready-assets",
  storage_path: "2026/09/04/job-1/master.mp4",
  qc_status: "passed",
  mime_type: "video/mp4",
};

describe("growth private asset access", () => {
  it("allows a QC-passed ready asset through a short-lived route policy", () => {
    expect(resolveGrowthAssetAccess(goodAsset, false)).toEqual({
      bucket: "growth-ready-assets",
      path: "2026/09/04/job-1/master.mp4",
      expiresIn: 120,
      disposition: "inline",
      filename: "stockbox-master-video-asset-1.mp4",
    });
  });

  it("uses attachment disposition for downloads", () => {
    expect(resolveGrowthAssetAccess(goodAsset, true).disposition).toBe("attachment");
  });

  it("rejects failed or pending QC", () => {
    expect(() => resolveGrowthAssetAccess({ ...goodAsset, qc_status: "failed" }, false)).toThrow("growth_asset_not_ready");
    expect(() => resolveGrowthAssetAccess({ ...goodAsset, qc_status: "pending" }, false)).toThrow("growth_asset_not_ready");
  });

  it("rejects staging/private voice assets even if the caller knows an id", () => {
    expect(() => resolveGrowthAssetAccess({ ...goodAsset, bucket: "growth-render-staging" }, false)).toThrow("growth_asset_not_ready");
    expect(() => resolveGrowthAssetAccess({ ...goodAsset, kind: "voice_audio" }, false)).toThrow("growth_asset_not_ready");
  });

  it("rejects path traversal and caller-inappropriate paths", () => {
    expect(() => resolveGrowthAssetAccess({ ...goodAsset, storage_path: "../growth-voice-private/founder.wav" }, false)).toThrow("growth_asset_invalid_path");
    expect(() => resolveGrowthAssetAccess({ ...goodAsset, storage_path: "/absolute/master.mp4" }, false)).toThrow("growth_asset_invalid_path");
    expect(() => resolveGrowthAssetAccess({ ...goodAsset, storage_path: "folder\\master.mp4" }, false)).toThrow("growth_asset_invalid_path");
  });
});
