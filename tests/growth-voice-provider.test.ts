import { describe, expect, it } from "vitest";
import { selectVoiceProvider } from "@/lib/growth/voice-provider";

describe("growth voice provider selection", () => {
  it("uses the active founder clone for Swedish", () => {
    expect(selectVoiceProvider({ language: "sv", founderProfileActive: true, englishEnabled: true })).toEqual({
      allowed: true,
      providerKind: "founder_clone",
      includeFounderReference: true,
      reason: "ok",
    });
  });

  it("never sends founder reference media to generic English voice", () => {
    expect(selectVoiceProvider({ language: "en", founderProfileActive: true, englishEnabled: true })).toEqual({
      allowed: true,
      providerKind: "generic_english",
      includeFounderReference: false,
      reason: "ok",
    });
  });

  it("defers Swedish automatic voice when the founder profile is unavailable", () => {
    expect(selectVoiceProvider({ language: "sv", founderProfileActive: false, englishEnabled: true })).toMatchObject({
      allowed: false,
      providerKind: null,
      includeFounderReference: false,
      reason: "founder_voice_unavailable",
    });
  });

  it("skips disabled English experiments without affecting Swedish", () => {
    expect(selectVoiceProvider({ language: "en", founderProfileActive: true, englishEnabled: false })).toMatchObject({
      allowed: false,
      providerKind: null,
      includeFounderReference: false,
      reason: "english_disabled",
    });
  });
});
