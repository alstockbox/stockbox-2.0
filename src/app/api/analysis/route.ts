import { z } from "zod";
import { captureServerEvent } from "@/lib/analytics/events";
import { getCurrentUser } from "@/lib/auth/session";
import { analyzeCompany } from "@/lib/data/provider";
import { checkAnalysisEntitlement, logApplicationError, persistAnalysis, recordUsageEvent } from "@/lib/db/repositories";
import { sendStrongBuyAlert } from "@/lib/notifications/admin-alerts";
import { getServerEnv } from "@/lib/env/server";

const requestSchema = z.object({
  company: z.object({
    ticker: z.string().trim().min(1).max(16),
    name: z.string().trim().min(1).max(200),
    cik: z.string().optional(),
    exchange: z.string().optional(),
    country: z.string().optional(),
    currency: z.string().optional(),
    canonicalTicker: z.string().optional(),
    entityId: z.string().optional(),
    securityType: z.enum(["Common Stock", "Preferred", "ETF/Fund", "ADR", "Other"]).optional(),
    providerCapabilities: z.object({
      fundamentals: z.boolean(),
      marketData: z.boolean(),
      providerIds: z.array(z.string()),
    }).optional(),
  }),
  analysisType: z.enum(["summary", "numbers", "deep", "research"]).default("summary"),
  investmentProfile: z
    .enum(["long_term", "short_term", "growth", "value", "quality", "dividend", "balanced"])
    .default("balanced")
});

export async function POST(request: Request) {
  const body = requestSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return Response.json({ error: "Invalid analysis request.", issues: body.error.flatten() }, { status: 422 });
  }

  const user = await getCurrentUser();
  if (user && user.role !== "admin") {
    const entitlement = await checkAnalysisEntitlement({ userId: user.id, analysisType: body.data.analysisType });
    if (!entitlement.allowed) {
      captureServerEvent("paywall_viewed", { userId: user.id, analysisType: body.data.analysisType, plan: entitlement.plan });
      return Response.json({ error: "Monthly analysis limit reached.", entitlement }, { status: 429 });
    }
  }
  captureServerEvent("analysis_started", {
    userId: user?.id,
    ticker: body.data.company.ticker,
    analysisType: body.data.analysisType
  });

  const result = await analyzeCompany(body.data);

  if (!result.ok) {
    await recordUsageEvent({
      userId: user?.id ?? null,
      event: "analysis_failed",
      metadata: { ticker: body.data.company.ticker, error: result.error }
    });
    captureServerEvent("analysis_failed", { userId: user?.id, ticker: body.data.company.ticker });
    return Response.json(result, { status: 503 });
  }

  const persisted = await persistAnalysis({
    userId: user?.id ?? null,
    report: result.data,
    rawProviderWarnings: result.warnings
  });

  if (persisted.ok) {
    result.data.id = persisted.id;
  } else {
    await logApplicationError({
      service: "analysis-api",
      message: persisted.error,
      userId: user?.id ?? null,
      context: { ticker: result.data.ticker }
    });
  }

  await recordUsageEvent({
    userId: user?.id ?? null,
    event: "analysis_completed",
    metadata: {
      ticker: result.data.ticker,
      score: result.data.score.score,
      recommendation: result.data.recommendation
    }
  });

  captureServerEvent("analysis_completed", {
    userId: user?.id,
    ticker: result.data.ticker,
    score: result.data.score.score,
    recommendation: result.data.recommendation
  });

  await sendStrongBuyAlert(
    result.data,
    `${getServerEnv().NEXT_PUBLIC_APP_URL}/admin?analysis=${encodeURIComponent(result.data.id)}`
  );

  return Response.json({ ...result, persisted: persisted.ok });
}
