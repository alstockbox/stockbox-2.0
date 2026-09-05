import { after } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { createDurableBatch } from "@/lib/batch/durable";
import { triggerDurableBatchWorker } from "@/lib/batch/worker-trigger";
import { getBatchEntitlement } from "@/lib/db/repositories";
import { checkDistributedRateLimit, clientRateLimitKey, rateLimitExceededResponse, RATE_LIMITS } from "@/lib/security/rate-limit";

export const runtime = "nodejs";

const companySchema = z.object({
  securityId: z.string().optional(),
  issuerId: z.string().optional(),
  ticker: z.string().trim().min(1).max(16),
  canonicalTicker: z.string().optional(),
  name: z.string().trim().min(1).max(200),
  cik: z.string().optional(),
  exchange: z.string().optional(),
  country: z.string().optional(),
  currency: z.string().optional(),
  entityId: z.string().optional(),
  isin: z.string().optional(),
  figi: z.string().optional(),
  lei: z.string().optional(),
  securityType: z.enum(["Common Stock", "Preferred", "ETF/Fund", "ADR", "Other"]).optional(),
  providerCapabilities: z.object({ fundamentals: z.boolean(), marketData: z.boolean(), providerIds: z.array(z.string()) }).optional(),
}).passthrough();
const requestSchema = z.object({
  analysisType: z.enum(["summary", "numbers", "deep", "research"]),
  investmentProfile: z.enum(["long_term", "short_term", "growth", "value", "quality", "dividend", "defensive", "balanced"]),
  items: z.array(z.object({
    input: z.string().trim().min(1).max(32),
    company: companySchema,
  })).min(1).max(50),
});

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in to create a batch." }, { status: 401 });

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid batch request." }, { status: 422 });

  const rateLimit = await checkDistributedRateLimit(
    clientRateLimitKey(request, "batch-create", user.id),
    RATE_LIMITS.batchResolve,
  );
  if (!rateLimit.allowed) return rateLimitExceededResponse(rateLimit);

  const companyKeys = parsed.data.items.map(({ company }) =>
    (company.securityId ?? company.isin ?? company.figi ?? company.canonicalTicker ?? company.ticker).trim().toUpperCase(),
  );
  if (new Set(companyKeys).size !== companyKeys.length) {
    return Response.json({ error: "A company can only appear once in the same batch." }, { status: 422 });
  }

  const entitlement = await getBatchEntitlement({
    userId: user.id,
    isAdmin: user.role === "admin",
    isAffiliateAmbassador: user.role === "affiliate_ambassador",
  });
  if (!entitlement.configured) return Response.json({ error: "Batch entitlements are temporarily unavailable." }, { status: 503 });
  if (!entitlement.allowed || parsed.data.items.length > entitlement.rowLimit) {
    return Response.json({ error: "This batch exceeds your current plan limit.", entitlement }, { status: 403 });
  }
  try {
    const batch = await createDurableBatch({
      userId: user.id,
      analysisType: parsed.data.analysisType,
      investmentProfile: parsed.data.investmentProfile,
      items: parsed.data.items,
    });
    after(async () => { await triggerDurableBatchWorker({ baseUrl: new URL(request.url).origin }); });
    return Response.json({ ok: true, ...batch }, { status: 202 });
  } catch (error) {
    console.error("[batch-create] Failed to queue batch", {
      userId: user.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return Response.json({ error: "The batch could not be queued." }, { status: 503 });
  }
}
