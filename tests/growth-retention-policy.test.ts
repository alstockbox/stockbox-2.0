import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { selectRetentionActions } from "@/lib/growth/retention-policy";

const now = new Date("2026-09-04T20:00:00Z");
const cleanupSource = readFileSync("supabase/functions/stockbox-growth-worker-api/retention.ts", "utf8");
const cycleSource = readFileSync("scripts/growth/run-render-cycle.mjs", "utf8");

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
    expect(selectRetentionActions({ now, readyRetentionDays: 1, assets: [{ id: "d", bucket: "growth-ready-assets", storagePath: "x/master.mp4", kind: "master_video", createdAt: "2026-08-01T10:00:00Z", renderState: "ready", packageStatus: "posted" }] })).toEqual([]);
  });

  it("deletes old unlinked ready assets", () => {
    expect(selectRetentionActions({ now, readyRetentionDays: 30, assets: [{ id: "e", bucket: "growth-ready-assets", storagePath: "x/old.mp4", kind: "master_video", createdAt: "2026-07-01T10:00:00Z", renderState: "ready", packageStatus: null }] })).toEqual([{ assetId: "e", bucket: "growth-ready-assets", storagePath: "x/old.mp4", reason: "ready_retention_expired" }]);
  });

  it("never selects founder voice profile storage", () => {
    expect(selectRetentionActions({ now, readyRetentionDays: 1, assets: [{ id: "voice", bucket: "growth-voice-private", storagePath: "founder/reference.wav", kind: "voice_audio", createdAt: "2025-01-01T00:00:00Z", renderState: "ready", packageStatus: null }] })).toEqual([]);
    expect(cleanupSource).toContain('["growth-render-staging", "growth-ready-assets"]');
    expect(cleanupSource).not.toContain('.from("growth-voice-private")');
  });

  it("runs cleanup automatically as part of the cloud render cycle", () => {
    expect(cycleSource).toContain('apiAction("cleanup")');
    expect(cycleSource).toContain('apiAction("materialize")');
  });
});
