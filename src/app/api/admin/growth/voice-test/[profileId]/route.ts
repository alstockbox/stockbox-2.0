import { requireAdmin } from "@/lib/auth/session";
import { resolveFounderVoiceTestAccess } from "@/lib/growth/voice-profile";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(_request: Request, context: { params: Promise<{ profileId: string }> }) {
  await requireAdmin();
  const { profileId } = await context.params;
  const supabase = createAdminClient();
  if (!supabase) return new Response("Unavailable", { status: 503 });

  const { data: profile } = await supabase
    .from("acq_voice_profiles")
    .select("id,metadata")
    .eq("id", profileId)
    .maybeSingle();
  if (!profile) return new Response("Not found", { status: 404 });

  let access;
  try {
    access = resolveFounderVoiceTestAccess(profileId, profile.metadata as Record<string, unknown>);
  } catch {
    return new Response("Not found", { status: 404 });
  }

  const { data: signed, error } = await supabase.storage
    .from(access.bucket)
    .createSignedUrl(access.path, access.expiresIn);
  if (error || !signed?.signedUrl) return new Response("Not found", { status: 404 });

  return new Response(null, {
    status: 302,
    headers: {
      Location: signed.signedUrl,
      "Cache-Control": "private, no-store, max-age=0",
    },
  });
}
