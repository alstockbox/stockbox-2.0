import { z } from "zod";
import { captureServerEvent } from "@/lib/analytics/events";
import { resolveCanonicalCompanySelection } from "@/lib/data/company-search";
import { analyzeCompany, searchCompanies, supportsUniversalSecurityAnalysis } from "@/lib/data/universal-security-live-provider";
import { checkDistributedRateLimit, clientRateLimitKey, rateLimitExceededResponse } from "@/lib/security/rate-limit";

export const runtime = "nodejs";

const PREVIEW_LIMIT = { limit: 2, windowMs: 24 * 60 * 60 * 1000 } as const;
const GLOBAL_PREVIEW_LIMIT = { limit: 500, windowMs: 24 * 60 * 60 * 1000 } as const;

const requestSchema = z.object({
  company: z.object({
    securityId: z.string().trim().min(1).max(200).optional(),
    issuerId: z.string().trim().min(1).max(200).optional(),
    ticker: z.string().trim().min(1).max(16),
    name: z.string().trim().min(1).max(200),
    cik: z.string().optional(),
    exchange: z.string().optional(),
    country: z.string().optional(),
    currency: z.string().optional(),
    canonicalTicker: z.string().optional(),
    entityId: z.string().optional(),
    isin: z.string().optional(),
    figi: z.string().optional(),
    lei: z.string().optional(),
    securityType: z.enum(["Common Stock", "Preferred", "ETF/Fund", "ADR", "Other"]).optional(),
    providerCapabilities: z.object({ fundamentals: z.boolean(), marketData: z.boolean(), providerIds: z.array(z.string()) }).optional(),
  }),
});

function coverageBand(value: number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "unknown";
  if (value >= 0.8 || value >= 80) return "high";
  if (value >= 0.5 || value >= 50) return "medium";
  return "low";
}

export async function POST(request: Request) {
  const [clientLimit, globalLimit] = await Promise.all([
    checkDistributedRateLimit(clientRateLimitKey(request, "public-analysis-preview"), PREVIEW_LIMIT),
    checkDistributedRateLimit("public-analysis-preview:global", GLOBAL_PREVIEW_LIMIT),
  ]);
  if (!clientLimit.allowed) return rateLimitExceededResponse(clientLimit);
  if (!globalLimit.allowed) return rateLimitExceededResponse(globalLimit);

  const body = requestSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Invalid preview request." }, { status: 422 });

  captureServerEvent("free_analysis_started");
  let candidates;
  try {
    candidates = await searchCompanies(body.data.company.canonicalTicker ?? body.data.company.ticker);
  } catch {
    captureServerEvent("free_analysis_failed", { errorCode: "identity_provider" });
    return Response.json({ error: "Company identity verification is temporarily unavailable." }, { status: 503 });
  }
  const resolution = resolveCanonicalCompanySelection(body.data.company, candidates);
  if (!resolution.ok) {
    captureServerEvent("free_analysis_failed", { errorCode: "identity" });
    return Response.json({ error: "Select the exact listed security and try again." }, { status: 409 });
  }
  if (!supportsUniversalSecurityAnalysis(resolution.company)) {
    captureServerEvent("free_analysis_failed", { errorCode: "unsupported" });
    return Response.json({ error: "Live fundamentals are not available for this security." }, { status: 422 });
  }

  const result = await analyzeCompany({
    company: resolution.company,
    analysisType: "summary",
    investmentProfile: "balanced",
  }).catch(() => null);
  if (!result?.ok) {
    captureServerEvent("free_analysis_failed", { errorCode: "analysis_unavailable" });
    return Response.json({ error: "Preview analysis is temporarily unavailable. Please try again later." }, { status: 503 });
  }

  const report = result.data;
  const dimensions = report.score.dimensions
    .filter((dimension) => ["valuation", "growth", "profitability", "financialHealth", "quality", "risk", "momentum"].includes(dimension.key))
    .map((dimension) => ({ key: dimension.key, label: dimension.label, score: dimension.score }));
  captureServerEvent("free_analysis_completed", { coverageBand: coverageBand(report.dataCoverage) });

  return Response.json({
    ok: true,
    preview: {
      ticker: report.ticker,
      companyName: report.companyName,
      generatedAt: report.generatedAt,
      oneSentence: report.oneSentence,
      recommendation: report.recommendation,
      score: report.score.score,
      confidence: report.score.confidence,
      dataCoverage: report.dataCoverage ?? null,
      currentPrice: report.market?.price ?? null,
      marketCurrency: report.market?.currency ?? null,
      dimensions,
    },
    requiresAccountForFullReport: true,
  });
}
