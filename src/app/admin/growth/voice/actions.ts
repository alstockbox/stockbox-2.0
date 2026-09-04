"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { canActivateFounderVoiceProfile, validateFounderVoiceUpload } from "@/lib/growth/voice-profile";
import { createAdminClient } from "@/lib/supabase/admin";

const VOICE_TEST_TEXT = "Det här är StockBox. På några sekunder kan du få en tydligare bild av ett bolags lönsamhet, risker och värdering innan du går vidare med din egen analys.";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function measuredCost(response: Response) {
  const raw = response.headers.get("x-stockbox-cost-sek");
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

async function markVoiceTestError(supabase: NonNullable<ReturnType<typeof createAdminClient>>, id: string, metadata: Record<string, unknown>, code: string) {
  await supabase.from("acq_voice_profiles").update({
    metadata: {
      ...metadata,
      profile_id: id,
      test_synthesis_passed: false,
      test_error: code,
      test_attempted_at: new Date().toISOString(),
    },
    updated_at: new Date().toISOString(),
  }).eq("id", id);
}

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
      profile_id: profileId,
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

export async function generateFounderVoiceTestAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") || "");
  if (!id) return;
  const supabase = createAdminClient();
  if (!supabase) return;

  const { data: profile } = await supabase
    .from("acq_voice_profiles")
    .select("id,language,status,storage_bucket,storage_path,metadata")
    .eq("id", id)
    .maybeSingle();
  if (!profile || profile.language !== "sv" || profile.status !== "testing") return;

  const metadata = asRecord(profile.metadata);
  const endpoint = String(process.env.GROWTH_VOICE_WORKER_URL || process.env.GROWTH_VOICE_ENDPOINT || "").trim();
  const token = String(process.env.GROWTH_VOICE_WORKER_TOKEN || "").trim();
  if (!endpoint || !token) {
    await markVoiceTestError(supabase, id, metadata, "voice_worker_not_configured");
    revalidatePath("/admin/growth/voice");
    return;
  }

  const { data: voiceCostConfig } = await supabase
    .from("acq_config")
    .select("value")
    .eq("key", "growth_voice_estimated_sek_per_job")
    .maybeSingle();
  const estimatedSek = Number(voiceCostConfig?.value);
  if (!Number.isFinite(estimatedSek) || estimatedSek < 0) {
    await markVoiceTestError(supabase, id, metadata, "voice_cost_not_configured");
    revalidatePath("/admin/growth/voice");
    return;
  }

  const usageKey = `voice-smoke:${id}`;
  const { data: authorization, error: authorizationError } = await supabase.rpc("acq_authorize_growth_cost_v3", {
    p_idempotency_key: usageKey,
    p_provider: "modal_chatterbox",
    p_operation: "founder_voice_smoke",
    p_estimated_sek: estimatedSek,
    p_content_id: null,
    p_render_job_id: null,
    p_optional: false,
  });
  if (authorizationError || authorization?.allowed !== true) {
    await markVoiceTestError(supabase, id, metadata, "voice_budget_blocked");
    revalidatePath("/admin/growth/voice");
    return;
  }

  const { data: signedReference, error: signedError } = await supabase.storage
    .from(profile.storage_bucket)
    .createSignedUrl(profile.storage_path, 300);
  if (signedError || !signedReference?.signedUrl) {
    await markVoiceTestError(supabase, id, metadata, "voice_reference_unavailable");
    revalidatePath("/admin/growth/voice");
    return;
  }

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        request_id: `voice-test-${id}`,
        text: VOICE_TEST_TEXT,
        language: "sv",
        voice_mode: "educational",
        reference_audio_url: signedReference.signedUrl,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok) throw new Error("voice_worker_failed");
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength < 44 || bytes.byteLength > 8 * 1024 * 1024) throw new Error("voice_sample_invalid");

    const samplePath = `voice-tests/${id}/sample.wav`;
    const { error: sampleUploadError } = await supabase.storage
      .from("growth-render-staging")
      .upload(samplePath, bytes, { contentType: "audio/wav", upsert: true, cacheControl: "0" });
    if (sampleUploadError) throw new Error("voice_sample_store_failed");

    const actualSek = measuredCost(response);
    const { error: finalizeError } = await supabase.rpc("acq_finalize_growth_usage_v3", {
      p_idempotency_key: usageKey,
      p_provider: "modal_chatterbox",
      p_operation: "founder_voice_smoke",
      p_estimated_sek: estimatedSek,
      p_actual_sek: actualSek,
      p_render_job_id: null,
    });
    if (finalizeError) throw new Error("voice_usage_finalize_failed");

    await supabase.from("acq_voice_profiles").update({
      metadata: {
        ...metadata,
        profile_id: id,
        test_synthesis_passed: true,
        test_sample_bucket: "growth-render-staging",
        test_sample_path: samplePath,
        test_synthesis_at: new Date().toISOString(),
        test_error: null,
      },
      updated_at: new Date().toISOString(),
    }).eq("id", id).eq("status", "testing");
  } catch {
    await markVoiceTestError(supabase, id, metadata, "voice_test_failed");
  }

  revalidatePath("/admin/growth/voice");
  revalidatePath("/admin/growth");
}

export async function activateFounderVoiceProfileAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") || "");
  if (!id) return;
  const supabase = createAdminClient();
  if (!supabase) return;

  const { data: profile } = await supabase
    .from("acq_voice_profiles")
    .select("id,language,status,metadata")
    .eq("id", id)
    .maybeSingle();
  if (!profile) return;
  const metadata = { ...asRecord(profile.metadata), profile_id: id };
  const policy = canActivateFounderVoiceProfile({ language: profile.language, status: profile.status, metadata });
  if (!policy.allowed) return;

  await supabase
    .from("acq_voice_profiles")
    .update({ status: "disabled", updated_at: new Date().toISOString() })
    .eq("language", "sv")
    .eq("status", "active")
    .neq("id", id);

  await supabase
    .from("acq_voice_profiles")
    .update({
      status: "active",
      metadata: { ...metadata, activated_at: new Date().toISOString(), test_error: null },
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "testing");

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
