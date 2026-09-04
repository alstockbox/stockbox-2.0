import { describe, expect, it } from "vitest";
import { selectVoiceProvider } from "@/lib/growth/voice-provider";

describe("growth voice provider routing", () => {
  it("uses founder clone for Swedish when the founder profile is active", () => {
    expect(selectVoiceProvider({ language: "sv", founderProfileActive: true, englishEnabled: true })).toEqual({
      allowed: true,
      providerKind: "founder_clone",
      includeFounderReference: true,
      reason: "ok",
    });
  });

  it("never sends founder reference to generic English voice", () => {
    expect(selectVoiceProvider({ language: "en", founderProfileActive: true, englishEnabled: true })).toEqual({
      allowed: true,
      providerKind: "generic_english",
      includeFounderReference: false,
      reason: "ok",
    });
  });

  it("defers Swedish when founder voice is unavailable", () => {
    expect(selectVoiceProvider({ language: "sv", founderProfileActive: false, englishEnabled: true })).toMatchObject({
      allowed: false,
      providerKind: null,
      reason: "founder_voice_unavailable",
    });
  });

  it("skips disabled English experiments", () => {
    expect(selectVoiceProvider({ language: "en", founderProfileActive: true, englishEnabled: false })).toMatchObject({
      allowed: false,
      providerKind: null,
      includeFounderReference: false,
      reason: "english_disabled",
    });
  });
});
