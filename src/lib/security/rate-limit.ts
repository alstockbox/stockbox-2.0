import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

export type RateLimitPolicy = {
  limit: number;
  windowMs: number;
};

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
};

type Bucket = {
  count: number;
  resetAt: number;
};

type HeaderReader = {
  get(name: string): string | null;
};

export const RATE_LIMITS = {
  authAction: { limit: 10, windowMs: 10 * 60 * 1000 },
  analysis: { limit: 80, windowMs: 10 * 60 * 1000 },
  adminAnalysis: { limit: 400, windowMs: 10 * 60 * 1000 },
  support: { limit: 8, windowMs: 10 * 60 * 1000 },
  batchResolve: { limit: 30, windowMs: 10 * 60 * 1000 },
  companySearch: { limit: 60, windowMs: 60 * 1000 },
  share: { limit: 30, windowMs: 10 * 60 * 1000 },
} as const satisfies Record<string, RateLimitPolicy>;

const buckets = new Map<string, Bucket>();

function pruneExpiredBuckets(now: number) {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export function rateLimitKeyFromHeaders(headers: HeaderReader, scope: string, subject?: string | null): string {
  const forwardedFor = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = headers.get("x-real-ip")?.trim();
  const client = subject?.trim() ? `user:${subject.trim()}` : `ip:${forwardedFor || realIp || "unknown"}`;
  return `${scope}:${client}`;
}

export function clientRateLimitKey(request: Request, scope: string, subject?: string | null): string {
  return rateLimitKeyFromHeaders(request.headers, scope, subject);
}

export function checkRateLimit(
  key: string,
  policy: RateLimitPolicy,
  now = Date.now(),
): RateLimitResult {
  pruneExpiredBuckets(now);

  const existing = buckets.get(key);
  const bucket = existing && existing.resetAt > now
    ? existing
    : { count: 0, resetAt: now + policy.windowMs };

  if (bucket.count >= policy.limit) {
    buckets.set(key, bucket);
    return {
      allowed: false,
      limit: policy.limit,
      remaining: 0,
      resetAt: bucket.resetAt,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }

  bucket.count += 1;
  buckets.set(key, bucket);
  return {
    allowed: true,
    limit: policy.limit,
    remaining: Math.max(0, policy.limit - bucket.count),
    resetAt: bucket.resetAt,
    retryAfterSeconds: 0,
  };
}

type DistributedRateLimitPayload = {
  allowed?: unknown;
  remaining?: unknown;
  reset_at?: unknown;
  retry_after_seconds?: unknown;
};

function distributedKeyHash(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

function parseDistributedResult(
  data: unknown,
  policy: RateLimitPolicy,
): RateLimitResult | null {
  const payload = (Array.isArray(data) ? data[0] : data) as DistributedRateLimitPayload | null;
  if (!payload || typeof payload.allowed !== "boolean") return null;
  const remaining = Number(payload.remaining);
  const retryAfterSeconds = Number(payload.retry_after_seconds);
  const resetAt = typeof payload.reset_at === "string" ? Date.parse(payload.reset_at) : Number.NaN;
  if (!Number.isFinite(remaining) || !Number.isFinite(retryAfterSeconds) || !Number.isFinite(resetAt)) return null;
  return {
    allowed: payload.allowed,
    limit: policy.limit,
    remaining: Math.max(0, Math.floor(remaining)),
    resetAt,
    retryAfterSeconds: Math.max(0, Math.ceil(retryAfterSeconds)),
  };
}

export async function checkDistributedRateLimit(
  key: string,
  policy: RateLimitPolicy,
  now = Date.now(),
): Promise<RateLimitResult> {
  const supabase = createAdminClient();
  if (!supabase) return checkRateLimit(key, policy, now);

  try {
    const { data, error } = await supabase.rpc("consume_rate_limit", {
      p_key_hash: distributedKeyHash(key),
      p_limit: policy.limit,
      p_window_seconds: Math.max(1, Math.ceil(policy.windowMs / 1000)),
      p_now: new Date(now).toISOString(),
    });
    if (error) throw new Error("distributed limiter RPC failed");
    const result = parseDistributedResult(data, policy);
    if (!result) throw new Error("distributed limiter returned invalid data");
    return result;
  } catch {
    console.error("Distributed rate limiter unavailable; failing closed until the shared limiter recovers.");
    const retryWindowMs = Math.min(policy.windowMs, 30_000);
    return {
      allowed: false,
      limit: policy.limit,
      remaining: 0,
      resetAt: now + retryWindowMs,
      retryAfterSeconds: Math.max(1, Math.ceil(retryWindowMs / 1000)),
    };
  }
}

export function rateLimitExceededResponse(result: RateLimitResult): Response {
  return Response.json(
    { error: "Too many requests. Please try again shortly." },
    {
      status: 429,
      headers: {
        "Retry-After": String(result.retryAfterSeconds),
        "X-RateLimit-Limit": String(result.limit),
        "X-RateLimit-Remaining": String(result.remaining),
        "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
      },
    },
  );
}
