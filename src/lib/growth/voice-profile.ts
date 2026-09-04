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
