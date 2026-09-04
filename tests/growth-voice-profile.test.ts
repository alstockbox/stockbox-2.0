import { describe, expect, it } from "vitest";
import {
  canActivateFounderVoiceProfile,
  resolveFounderVoiceTestAccess,
  validateFounderVoiceUpload,
} from "@/lib/growth/voice-profile";

describe("founder voice profile upload validation", () => {
  it("accepts a consented Swedish reference recording under 25 MB", () => {
    expect(validateFounderVoiceUpload({
      language: "sv",
      mimeType: "audio/wav",
      sizeBytes: 8_000_000,
      consent: true,
    })).toEqual({ allowed: true, extension: "wav", reason: null });
  });

  it("accepts common browser audio MIME variants", () => {
    expect(validateFounderVoiceUpload({ language: "sv", mimeType: "audio/mpeg", sizeBytes: 2_000_000, consent: true }).allowed).toBe(true);
    expect(validateFounderVoiceUpload({ language: "sv", mimeType: "audio/mp4", sizeBytes: 2_000_000, consent: true }).allowed).toBe(true);
    expect(validateFounderVoiceUpload({ language: "sv", mimeType: "audio/x-m4a", sizeBytes: 2_000_000, consent: true }).allowed).toBe(true);
  });

  it("rejects missing consent", () => {
    expect(validateFounderVoiceUpload({ language: "sv", mimeType: "audio/wav", sizeBytes: 2_000_000, consent: false }).reason).toBe("consent_required");
  });

  it("rejects oversized or unsupported files", () => {
    expect(validateFounderVoiceUpload({ language: "sv", mimeType: "audio/wav", sizeBytes: 26 * 1024 * 1024, consent: true }).reason).toBe("file_too_large");
    expect(validateFounderVoiceUpload({ language: "sv", mimeType: "video/mp4", sizeBytes: 2_000_000, consent: true }).reason).toBe("unsupported_audio_type");
  });

  it("rejects non-Swedish founder clone profiles", () => {
    expect(validateFounderVoiceUpload({ language: "en", mimeType: "audio/wav", sizeBytes: 2_000_000, consent: true }).reason).toBe("founder_voice_must_be_swedish");
  });
});

describe("founder voice smoke activation policy", () => {
  it("allows activation only after a private smoke synthesis passed", () => {
    expect(canActivateFounderVoiceProfile({
      language: "sv",
      status: "testing",
      metadata: {
        test_synthesis_passed: true,
        test_sample_bucket: "growth-render-staging",
        test_sample_path: "voice-tests/profile-1/sample.wav",
      },
    })).toEqual({ allowed: true, reason: null });
  });

  it("blocks activation before the smoke sample passes", () => {
    expect(canActivateFounderVoiceProfile({
      language: "sv",
      status: "testing",
      metadata: { test_synthesis_passed: false },
    }).reason).toBe("voice_test_required");
  });

  it("blocks disabled, failed, or non-Swedish profiles", () => {
    expect(canActivateFounderVoiceProfile({ language: "en", status: "testing", metadata: {} }).reason).toBe("founder_voice_must_be_swedish");
    expect(canActivateFounderVoiceProfile({ language: "sv", status: "disabled", metadata: {} }).reason).toBe("profile_not_activatable");
    expect(canActivateFounderVoiceProfile({ language: "sv", status: "failed", metadata: {} }).reason).toBe("profile_not_activatable");
  });

  it("exposes only the synthesized private test sample, never the reference recording", () => {
    expect(resolveFounderVoiceTestAccess("profile-1", {
      test_sample_bucket: "growth-render-staging",
      test_sample_path: "voice-tests/profile-1/sample.wav",
      test_synthesis_passed: true,
    })).toEqual({
      bucket: "growth-render-staging",
      path: "voice-tests/profile-1/sample.wav",
      expiresIn: 120,
    });

    expect(() => resolveFounderVoiceTestAccess("profile-1", {
      test_sample_bucket: "growth-voice-private",
      test_sample_path: "profiles/profile-1/reference.wav",
      test_synthesis_passed: true,
    })).toThrow("voice_test_asset_forbidden");
    expect(() => resolveFounderVoiceTestAccess("profile-1", {
      test_sample_bucket: "growth-render-staging",
      test_sample_path: "voice-tests/other-profile/sample.wav",
      test_synthesis_passed: true,
    })).toThrow("voice_test_asset_forbidden");
  });
});
