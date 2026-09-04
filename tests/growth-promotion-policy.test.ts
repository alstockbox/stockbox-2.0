import { describe, expect, it } from "vitest";
import { canPromoteRenderToReady } from "@/lib/growth/promotion-policy";

const base = {
  shadowMode: false,
  renderState: "ready",
  language: "sv" as const,
  founderVoiceActive: true,
  assets: [
    { kind: "master_video", qcStatus: "passed" },
    { kind: "cover", qcStatus: "passed" },
  ],
  paidOperations: [{ provider: "voice", ledgerRecorded: true }],
  packages: [
    { platform: "instagram_reel", copy: "Caption https://www.getstockbox.app/?utm_source=instagram_reel", utmUrl: "https://www.getstockbox.app/?utm_source=instagram_reel" },
    { platform: "facebook_reel", copy: "Caption https://www.getstockbox.app/?utm_source=facebook_reel", utmUrl: "https://www.getstockbox.app/?utm_source=facebook_reel" },
    { platform: "tiktok", copy: "Caption https://www.getstockbox.app/?utm_source=tiktok", utmUrl: "https://www.getstockbox.app/?utm_source=tiktok" },
    { platform: "youtube_short", copy: "Description https://www.getstockbox.app/?utm_source=youtube_short", utmUrl: "https://www.getstockbox.app/?utm_source=youtube_short" },
  ],
};

describe("growth render promotion policy", () => {
  it("promotes only a complete QC-passed render", () => {
    expect(canPromoteRenderToReady(base)).toEqual({ allowed: true, reasons: [] });
  });

  it("blocks promotion while shadow mode is enabled", () => {
    const result = canPromoteRenderToReady({ ...base, shadowMode: true });
    expect(result.allowed).toBe(false);
    expect(result.reasons).toContain("shadow_mode");
  });

  it("blocks missing or failed required assets", () => {
    expect(canPromoteRenderToReady({ ...base, assets: [{ kind: "master_video", qcStatus: "passed" }] }).reasons).toContain("cover_not_ready");
    expect(canPromoteRenderToReady({ ...base, assets: [{ kind: "master_video", qcStatus: "failed" }, { kind: "cover", qcStatus: "passed" }] }).reasons).toContain("master_video_not_ready");
  });

  it("requires the active founder clone for Swedish automatic video", () => {
    expect(canPromoteRenderToReady({ ...base, founderVoiceActive: false }).reasons).toContain("founder_voice_not_active");
  });

  it("blocks paid operations without budget telemetry", () => {
    expect(canPromoteRenderToReady({ ...base, paidOperations: [{ provider: "voice", ledgerRecorded: false }] }).reasons).toContain("budget_telemetry_missing");
  });

  it("blocks package copy that is missing its tracked link", () => {
    const packages = base.packages.map((pkg, index) => index === 0 ? { ...pkg, copy: "Caption utan länk" } : pkg);
    expect(canPromoteRenderToReady({ ...base, packages }).reasons).toContain("package_tracking_missing");
  });

  it("does not require a founder clone for English generic-voice experiments", () => {
    expect(canPromoteRenderToReady({ ...base, language: "en", founderVoiceActive: false }).allowed).toBe(true);
  });
});
