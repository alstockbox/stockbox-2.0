"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { validateFounderVoiceUpload } from "@/lib/growth/voice-profile";
import { createAdminClient } from "@/lib/supabase/admin";

export async function uploadFounderVoiceProfileAction(formData: FormData) {
  await requireAdmin();
  const file = formData.get("voiceFile");
  const consent = formData.get("consent") === "on";
  if (!(file instanceof File)) return;

  const validation = validateFounderVoiceUpload({
    language: "sv",
    mimeType: file.type,
    sizeBytes: file.size,
    consent,
  });
  if (!validation.allowed || !validation.extension) return;

  const supabase = createAdminClient();
  if (!supabase) return;

  const profileId = crypto.randomUUID();
  const path = `profiles/${profileId}/reference.${validation.extension}`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error: uploadError } = await supabase.storage
    .from("growth-voice-private")
    .upload(path, bytes, {
      contentType: file.type,
      upsert: false,
      cacheControl: "0",
    });
  if (uploadError) return;

  const consentAt = new Date().toISOString();
  const { error: rowError } = await supabase.from("acq_voice_profiles").insert({
    id: profileId,
    idempotency_key: `founder-sv:${profileId}`,
    language: "sv",
    provider: "chatterbox",
    model: "multilingual-v3",
    storage_bucket: "growth-voice-private",
    storage_path: path,
    status: "testing",
    consent_at: consentAt,
    metadata: {
      original_mime: file.type,
      size_bytes: file.size,
      source: "admin_private_upload",
      test_synthesis_passed: false,
    },
  });

  if (rowError) {
    await supabase.storage.from("growth-voice-private").remove([path]);
    return;
  }

  revalidatePath("/admin/growth/voice");
  revalidatePath("/admin/growth");
}

export async function disableFounderVoiceProfileAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") || "");
  if (!id) return;
  const supabase = createAdminClient();
  if (!supabase) return;
  await supabase
    .from("acq_voice_profiles")
    .update({ status: "disabled", updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("language", "sv");
  revalidatePath("/admin/growth/voice");
  revalidatePath("/admin/growth");
}
