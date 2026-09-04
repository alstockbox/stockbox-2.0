import { describe, expect, it } from "vitest";
import { validateFounderVoiceUpload } from "@/lib/growth/voice-profile";

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
