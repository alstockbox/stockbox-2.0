export const FOUNDER_VOICE_MAX_BYTES = 25 * 1024 * 1024;

const MIME_EXTENSIONS: Record<string, string> = {
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
};

export type FounderVoiceUploadValidation = {
  allowed: boolean;
  extension: string | null;
  reason: "consent_required" | "founder_voice_must_be_swedish" | "file_too_large" | "unsupported_audio_type" | "empty_file" | null;
};

export function validateFounderVoiceUpload(input: {
  language: string;
  mimeType: string;
  sizeBytes: number;
  consent: boolean;
}): FounderVoiceUploadValidation {
  if (!input.consent) return { allowed: false, extension: null, reason: "consent_required" };
  if (input.language !== "sv") return { allowed: false, extension: null, reason: "founder_voice_must_be_swedish" };
  if (!Number.isFinite(input.sizeBytes) || input.sizeBytes <= 0) return { allowed: false, extension: null, reason: "empty_file" };
  if (input.sizeBytes > FOUNDER_VOICE_MAX_BYTES) return { allowed: false, extension: null, reason: "file_too_large" };
  const extension = MIME_EXTENSIONS[String(input.mimeType || "").toLowerCase()] ?? null;
  if (!extension) return { allowed: false, extension: null, reason: "unsupported_audio_type" };
  return { allowed: true, extension, reason: null };
}

type FounderVoiceMetadata = Record<string, unknown>;

export function resolveFounderVoiceTestAccess(profileId: string, metadata: FounderVoiceMetadata) {
  const bucket = String(metadata.test_sample_bucket || "");
  const path = String(metadata.test_sample_path || "");
  const prefix = `voice-tests/${profileId}/`;
  if (
    metadata.test_synthesis_passed !== true ||
    bucket !== "growth-render-staging" ||
    !path.startsWith(prefix) ||
    path.includes("..") ||
    path.includes("\\") ||
    !path.toLowerCase().endsWith(".wav")
  ) {
    throw new Error("voice_test_asset_forbidden");
  }
  return { bucket: "growth-render-staging" as const, path, expiresIn: 120 as const };
}

export function canActivateFounderVoiceProfile(input: {
  language: string;
  status: string;
  metadata: FounderVoiceMetadata;
}): { allowed: boolean; reason: "founder_voice_must_be_swedish" | "profile_not_activatable" | "voice_test_required" | null } {
  if (input.language !== "sv") return { allowed: false, reason: "founder_voice_must_be_swedish" };
  if (!["testing", "active"].includes(input.status)) return { allowed: false, reason: "profile_not_activatable" };
  try {
    const profileId = String(input.metadata.profile_id || "");
    if (profileId) {
      resolveFounderVoiceTestAccess(profileId, input.metadata);
    } else if (
      input.metadata.test_synthesis_passed !== true ||
      input.metadata.test_sample_bucket !== "growth-render-staging" ||
      !String(input.metadata.test_sample_path || "").startsWith("voice-tests/")
    ) {
      throw new Error("voice_test_asset_forbidden");
    }
  } catch {
    return { allowed: false, reason: "voice_test_required" };
  }
  return { allowed: true, reason: null };
}
