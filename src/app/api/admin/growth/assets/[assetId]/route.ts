import { requireAdmin } from "@/lib/auth/session";
import { resolveGrowthAssetAccess } from "@/lib/growth/asset-access";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request, context: { params: Promise<{ assetId: string }> }) {
  await requireAdmin();
  const { assetId } = await context.params;
  const supabase = createAdminClient();
  if (!supabase) return new Response("Supabase unavailable", { status: 503 });

  const { data: asset, error } = await supabase
    .from("acq_media_assets")
    .select("id,kind,bucket,storage_path,qc_status,mime_type")
    .eq("id", assetId)
    .maybeSingle();

  if (error || !asset) return new Response("Asset not found", { status: 404 });

  const requestedDownload = new URL(request.url).searchParams.get("download") === "1";
  let access;
  try {
    access = resolveGrowthAssetAccess(asset, requestedDownload);
  } catch {
    // Intentionally do not reveal whether a private/staging/voice asset exists.
    return new Response("Asset not found", { status: 404 });
  }

  const storage = supabase.storage.from(access.bucket);
  const signed = access.disposition === "attachment"
    ? await storage.createSignedUrl(access.path, access.expiresIn, { download: access.filename })
    : await storage.createSignedUrl(access.path, access.expiresIn);

  if (signed.error || !signed.data?.signedUrl) {
    return new Response("Asset unavailable", { status: 502 });
  }

  return new Response(null, {
    status: 302,
    headers: {
      Location: signed.data.signedUrl,
      "Cache-Control": "private, no-store, max-age=0",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
