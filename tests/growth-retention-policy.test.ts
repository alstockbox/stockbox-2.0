import { describe, expect, it } from "vitest";
import { selectRetentionActions } from "@/lib/growth/retention-policy";

const now = new Date("2026-09-04T20:00:00Z");

describe("growth retention policy", () => {
  it("deletes staging intermediates for completed jobs", () => {
    expect(selectRetentionActions({ now, readyRetentionDays: 60, assets: [{ id: "a", bucket: "growth-render-staging", storagePath: "x/voice.wav", kind: "voice_audio", createdAt: "2026-09-04T19:00:00Z", renderState: "ready", packageStatus: null }] })).toEqual([{ assetId: "a", bucket: "growth-render-staging", storagePath: "x/voice.wav", reason: "staging_completed" }]);
  });

  it("deletes failed staging older than 24 hours", () => {
    expect(selectRetentionActions({ now, readyRetentionDays: 60, assets: [{ id: "b", bucket: "growth-render-staging", storagePath: "x/old.wav", kind: "voice_audio", createdAt: "2026-09-03T18:00:00Z", renderState: "failed", packageStatus: null }] })).toHaveLength(1);
  });

  it("keeps recent ready assets", () => {
    expect(selectRetentionActions({ now, readyRetentionDays: 60, assets: [{ id: "c", bucket: "growth-ready-assets", storagePath: "x/master.mp4", kind: "master_video", createdAt: "2026-08-20T10:00:00Z", renderState: "ready", packageStatus: null }] })).toEqual([]);
  });

  it("keeps assets linked to active or published packages", () => {
    expect(selectRetentionActions({ now, readyRetentionDays: 1, assets: [{ id: "d", bucket: "growth-ready-assets", storagePath: "x/master.mp4", kind: "master_video", createdAt: "2026-08-01T10:00:00Z", renderState: "ready", packageStatus: "published" }] })).toEqual([]);
  });

  it("deletes old unlinked ready assets", () => {
    expect(selectRetentionActions({ now, readyRetentionDays: 30, assets: [{ id: "e", bucket: "growth-ready-assets", storagePath: "x/old.mp4", kind: "master_video", createdAt: "2026-07-01T10:00:00Z", renderState: "ready", packageStatus: null }] })).toEqual([{ assetId: "e", bucket: "growth-ready-assets", storagePath: "x/old.mp4", reason: "ready_retention_expired" }]);
  });

  it("never selects founder voice profile storage", () => {
    expect(selectRetentionActions({ now, readyRetentionDays: 1, assets: [{ id: "voice", bucket: "growth-voice-private", storagePath: "founder/reference.wav", kind: "voice_audio", createdAt: "2025-01-01T00:00:00Z", renderState: "ready", packageStatus: null }] })).toEqual([]);
  });
});
