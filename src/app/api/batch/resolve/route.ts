import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import {
  findExactBatchCompany,
  mapWithConcurrency,
  MAX_BATCH_ROWS,
  normalizeBatchSymbol,
} from "@/lib/batch/input";
import { supportsLiveFundamentals } from "@/components/analysis/analysis-workbench-state";
import { searchCompanies } from "@/lib/data/provider";
import { getBatchEntitlement } from "@/lib/db/repositories";

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
      const company = findExactBatchCompany(symbol, await searchCompanies(symbol));
      if (!company) {
        return {
          input: symbol,
          status: "not_found" as const,
          error: "No exact ticker match was found.",
        };
      }
      if (!supportsLiveFundamentals(company)) {
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
