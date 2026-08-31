import { captureServerEvent, isClientAnalyticsEvent } from "@/lib/analytics/events";
import { getCurrentUser } from "@/lib/auth/session";
import {
  checkDistributedRateLimit,
  clientRateLimitKey,
  RATE_LIMITS,
  rateLimitExceededResponse,
} from "@/lib/security/rate-limit";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  const rateLimit = await checkDistributedRateLimit(
    clientRateLimitKey(request, "analytics", user?.id),
    RATE_LIMITS.analytics,
  );
  if (!rateLimit.allowed) return rateLimitExceededResponse(rateLimit);

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Invalid analytics event." }, { status: 400 });
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return Response.json({ error: "Invalid analytics event." }, { status: 400 });
  }
  const record = payload as { event?: unknown; properties?: unknown };
  if (!isClientAnalyticsEvent(record.event)) {
    return Response.json({ error: "Invalid analytics event." }, { status: 400 });
  }
  const properties = record.properties && typeof record.properties === "object" && !Array.isArray(record.properties)
    ? record.properties as Record<string, unknown>
    : {};

  captureServerEvent(record.event, { ...properties, userId: user?.id });
  return new Response(null, { status: 204 });
}
