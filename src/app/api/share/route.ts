import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { captureServerEvent } from "@/lib/analytics/events";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkDistributedRateLimit, clientRateLimitKey, rateLimitExceededResponse, RATE_LIMITS } from "@/lib/security/rate-limit";

const schema = z.object({
  analysisId: z.string().uuid()
});

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Authentication required." }, { status: 401 });
  const body = schema.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Invalid share request." }, { status: 422 });

  const rateLimit = await checkDistributedRateLimit(
    clientRateLimitKey(request, "share", user.id),
    RATE_LIMITS.share
  );
  if (!rateLimit.allowed) {
    return rateLimitExceededResponse(rateLimit);
  }

  const supabase = createAdminClient();
  if (!supabase) return Response.json({ error: "Sharing requires Supabase configuration." }, { status: 503 });

  const { data: ownedAnalysis } = await supabase
    .from("analyses")
    .select("id")
    .eq("id", body.data.analysisId)
    .eq("user_id", user.id)
    .single();
  if (!ownedAnalysis) return Response.json({ error: "Analysis not found." }, { status: 404 });

  const token = crypto.randomUUID();
  const { error } = await supabase.from("share_links").insert({
    token,
    analysis_id: body.data.analysisId,
    created_by: user.id
  });

  if (error) {
    return Response.json(
      { error: "Sharing is temporarily unavailable. Please try again shortly." },
      { status: 500 }
    );
  }

  captureServerEvent("share_created", { userId: user.id, analysisId: body.data.analysisId });
  return Response.json({ token });
}
