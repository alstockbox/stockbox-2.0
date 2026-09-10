import { normalizeAcquisitionPayload, isLikelyBot } from "@/lib/analytics/acquisition";
import { getCurrentUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  checkDistributedRateLimit,
  clientRateLimitKey,
  RATE_LIMITS,
  rateLimitExceededResponse,
} from "@/lib/security/rate-limit";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  const rateLimit = await checkDistributedRateLimit(
    clientRateLimitKey(request, "acquisition", user?.id),
    RATE_LIMITS.analytics,
  );
  if (!rateLimit.allowed) return rateLimitExceededResponse(rateLimit);

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "invalid_payload" }, { status: 400 });
  }

  const normalized = normalizeAcquisitionPayload(payload, user?.id ?? null);
  if (!normalized.ok) return Response.json({ error: normalized.error }, { status: 400 });

  const supabase = createAdminClient();
  if (!supabase) return Response.json({ error: "analytics_unavailable" }, { status: 503 });

  const value = normalized.value;
  const userAgent = request.headers.get("user-agent");
  const isInternal = process.env.NODE_ENV !== "production"
    || request.headers.get("host")?.includes("localhost") === true;

  const { error } = await supabase.from("acq_events").insert({
    ...value,
    is_bot: isLikelyBot(userAgent),
    is_internal: isInternal,
    raw_payload: payload,
    updated_at: new Date().toISOString(),
  });

  if (!error) return new Response(null, { status: 204 });
  if (error.code === "23505") return new Response(null, { status: 204 });

  console.error("Acquisition event insert failed", { code: error.code, message: error.message });
  return Response.json({ error: "event_storage_failed" }, { status: 500 });
}
