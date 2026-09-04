export type VoiceProviderDecision = {
  allowed: boolean;
  providerKind: "founder_clone" | "generic_english" | null;
  includeFounderReference: boolean;
  reason: "ok" | "founder_voice_unavailable" | "english_disabled";
};

export type VoiceProviderInput = {
  language: "sv" | "en";
  founderProfileActive: boolean;
  englishEnabled: boolean;
};

export function selectVoiceProvider(input: VoiceProviderInput): VoiceProviderDecision {
  if (input.language === "sv") {
    if (!input.founderProfileActive) {
      return {
        allowed: false,
        providerKind: null,
        includeFounderReference: false,
        reason: "founder_voice_unavailable",
      };
    }
    return {
      allowed: true,
      providerKind: "founder_clone",
      includeFounderReference: true,
      reason: "ok",
    };
  }

  if (!input.englishEnabled) {
    return {
      allowed: false,
      providerKind: null,
      includeFounderReference: false,
      reason: "english_disabled",
    };
  }

  return {
    allowed: true,
    providerKind: "generic_english",
    includeFounderReference: false,
    reason: "ok",
  };
}
