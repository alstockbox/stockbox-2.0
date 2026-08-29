import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import {
  mapWithConcurrency,
  MAX_BATCH_ROWS,
  normalizeBatchSymbol,
} from "@/lib/batch/input";
import { resolveCanonicalCompanySelection } from "@/lib/data/company-search";
import { searchCompanies } from "@/lib/data/provider";
import { supportsLiveFundamentalsSecurity } from "@/lib/data/security-classification";
import { getBatchEntitlement } from "@/lib/db/repositories";
import { checkDistributedRateLimit, clientRateLimitKey, rateLimitExceededResponse, RATE_LIMITS } from "@/lib/security/rate-limit";

const requestSchema = z.object({
  symbols: z
    .array(z.string().trim().min(1).max(16).regex(/^[A-Za-z0-9^][A-Za-z0-9.^=-]*$/))
    .min(1)
    .max(MAX_BATCH_ROWS),
});

export async function POST(request: Request) {
  const body = requestSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return Response.json(
      { error: `Enter between 1 and ${MAX_BATCH_ROWS} valid ticker symbols.`, issues: body.error.flatten() },
      { status: 422 },
    );
  }
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "Sign in to prepare a batch." }, { status: 401 });
  }

  const rateLimit = await checkDistributedRateLimit(
    clientRateLimitKey(request, "batch-resolve", user.id),
    RATE_LIMITS.batchResolve
  );
  if (!rateLimit.allowed) {
    return rateLimitExceededResponse(rateLimit);
  }

  const entitlement = await getBatchEntitlement({
    userId: user.id,
    isAdmin: user.role === "admin",
  });
  if (!entitlement.configured) {
    return Response.json({ error: "Batch entitlements are temporarily unavailable." }, { status: 503 });
  }
  if (!entitlement.allowed) {
    return Response.json(
      { error: "Batch analysis is not included in your current plan.", entitlement },
      { status: 403 },
    );
  }

  const symbols = [...new Set(body.data.symbols.map(normalizeBatchSymbol))];
  if (symbols.length > entitlement.rowLimit) {
    return Response.json(
      { error: `Your ${entitlement.plan} plan supports up to ${entitlement.rowLimit} companies per batch.`, entitlement },
      { status: 422 },
    );
  }
  const items = await mapWithConcurrency(symbols, 4, async (symbol) => {
    try {
      const resolution = resolveCanonicalCompanySelection(
        { ticker: symbol, canonicalTicker: symbol, name: symbol },
        await searchCompanies(symbol),
      );
      if (!resolution.ok) {
        return {
          input: symbol,
          status: resolution.reason === "ambiguous" ? "ambiguous" as const : "not_found" as const,
          error: resolution.reason === "ambiguous"
            ? "Multiple exact listings matched. Select a stable security identifier."
            : "No exact ticker match was found.",
        };
      }
      const company = resolution.company;
      if (!supportsLiveFundamentalsSecurity(company)) {
        return {
          input: symbol,
          company,
          status: "unsupported" as const,
          error: "Live fundamentals are not available for this security.",
        };
      }
      return { input: symbol, company, status: "ready" as const };
    } catch {
      return {
        input: symbol,
        status: "lookup_failed" as const,
        error: "Company lookup failed. You can validate the batch again.",
      };
    }
  });

  return Response.json({ items, entitlement, maxRows: MAX_BATCH_ROWS });
}
