import { createHash } from "node:crypto";
import { z } from "zod";
import { recordAnalysisObservability, recordProviderDiagnostics } from "@/lib/analytics/analysis-observability";
import { captureServerEvent } from "@/lib/analytics/events";
import { researchViewForReport } from "@/lib/analysis/research-view";
import { getCurrentUser } from "@/lib/auth/session";
import { resolveCanonicalCompanySelection } from "@/lib/data/company-search";
import { analyzeCompany, searchCompanies, supportsUniversalSecurityAnalysis } from "@/lib/data/universal-security-provider";
import {
  completeAnalysisReservation,
  getAnalysisReplay,
  logApplicationError,
  persistAnalysis,
  recordUsageEvent,
  releaseAnalysisReservation,
  reserveAnalysisEntitlement,
} from "@/lib/db/repositories";
import { sendStrongResearchAlert } from "@/lib/notifications/admin-alerts";
import { getServerEnv } from "@/lib/env/server";
import { publicDiagnosticCode, sanitizeDiagnosticMessage } from "@/lib/security/diagnostics";
import { checkDistributedRateLimit, clientRateLimitKey, rateLimitExceededResponse, RATE_LIMITS } from "@/lib/security/rate-limit";

export const runtime = "nodejs";

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
    providerCapabilities: z.object({
      fundamentals: z.boolean(),
      marketData: z.boolean(),
      providerIds: z.array(z.string()),
    }).optional(),
  }),
  analysisType: z.enum(["summary", "numbers", "deep", "research"]).default("summary"),
  investmentProfile: z
    .enum(["long_term", "short_term", "growth", "value", "quality", "dividend", "defensive", "balanced"])
    .default("balanced"),
  idempotencyKey: z.string().uuid().optional()
});

function analysisRequestFingerprint(input: {
  securityId?: string;
  canonicalTicker?: string;
  ticker: string;
  issuerId?: string;
  entityId?: string;
  cik?: string;
  analysisType: string;
  investmentProfile: string;
}) {
  return createHash("sha256").update(JSON.stringify({
    securityId: input.securityId ?? null,
    canonicalTicker: input.canonicalTicker ?? input.ticker,
    issuerId: input.issuerId ?? null,
    entityId: input.entityId ?? null,
    cik: input.cik ?? null,
    analysisType: input.analysisType,
    investmentProfile: input.investmentProfile,
  })).digest("hex");
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "Sign in to run an analysis." }, { status: 401 });
  }

  const body = requestSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return Response.json({ error: "Invalid analysis request.", issues: body.error.flatten() }, { status: 422 });
  }

  const analysisRateLimit = user.role === "admin" ? RATE_LIMITS.adminAnalysis : RATE_LIMITS.analysis;
  const rateLimit = await checkDistributedRateLimit(
    clientRateLimitKey(request, "analysis", user.id),
    analysisRateLimit
  );
  if (!rateLimit.allowed) {
    return rateLimitExceededResponse(rateLimit);
  }

  const idempotencyKey = body.data.idempotencyKey;
  const requestFingerprint = idempotencyKey
    ? analysisRequestFingerprint({
        ...body.data.company,
        analysisType: body.data.analysisType,
        investmentProfile: body.data.investmentProfile,
      })
    : undefined;

  if (idempotencyKey && requestFingerprint) {
    const replay = await getAnalysisReplay({ userId: user.id, idempotencyKey, requestFingerprint });
    if (replay.status === "unavailable") {
      return Response.json({ error: "Analysis retry safety is temporarily unavailable." }, { status: 503 });
    }
    if (replay.status === "conflict") {
      return Response.json({ error: "This analysis retry key belongs to a different request." }, { status: 409 });
    }
    if (replay.status === "replay") {
      const replayData = { ...replay.report, id: replay.id };
      if (user.role !== "admin") delete replayData.adminQa;
      return Response.json({ ok: true, data: replayData, sources: [], warnings: [], persisted: true, replayed: true });
    }
  }

  let candidates;
  try {
    candidates = await searchCompanies(body.data.company.canonicalTicker ?? body.data.company.ticker);
  } catch {
    return Response.json({ error: "Company identity verification is temporarily unavailable." }, { status: 503 });
  }
  const resolution = resolveCanonicalCompanySelection(body.data.company, candidates);
  if (!resolution.ok) {
    if (resolution.reason === "ambiguous") {
      return Response.json(
        { error: "Selected company identity is ambiguous. Search and select the exact listing again." },
        { status: 409 }
      );
    }
    return Response.json(
      { error: resolution.reason === "identity_mismatch"
        ? "Selected company identity could not be verified."
        : "Selected company listing could not be verified." },
      { status: 409 }
    );
  }
  const canonicalCompany = resolution.company;

  if (!supportsUniversalSecurityAnalysis(canonicalCompany)) {
    return Response.json(
      { error: "Live fundamentals are not available for this security." },
      { status: 422 }
    );
  }

  let quotaReservationId: string | null = null;
  if (user.role !== "admin") {
    const entitlement = await reserveAnalysisEntitlement({ userId: user.id, analysisType: body.data.analysisType });
    if (!entitlement.configured) {
      return Response.json({ error: "Analysis quotas are temporarily unavailable." }, { status: 503 });
    }
    if (!entitlement.allowed) {
      captureServerEvent("paywall_viewed", { userId: user.id, analysisType: body.data.analysisType, plan: entitlement.plan });
      return Response.json({ error: "Monthly analysis limit reached.", entitlement }, { status: 429 });
    }
    quotaReservationId = entitlement.reservationId ?? null;
  }

  captureServerEvent("analysis_started", {
    userId: user.id,
    ticker: canonicalCompany.ticker,
    analysisType: body.data.analysisType
  });

  const result = await analyzeCompany({ ...body.data, company: canonicalCompany }).catch(async (error) => {
    const message = sanitizeDiagnosticMessage(error, "Analysis failed unexpectedly.");
    if (quotaReservationId) {
      await releaseAnalysisReservation({ reservationId: quotaReservationId, status: "failed" });
    }
    await logApplicationError({
      service: "analysis-api",
      message,
      userId: user.id,
      context: { ticker: canonicalCompany.ticker, stage: "analysis" }
    });
    await recordUsageEvent({
      userId: user.id,
      event: "analysis_failed",
      metadata: { ticker: canonicalCompany.ticker, errorCode: publicDiagnosticCode(error, "analysis_exception") }
    });
    captureServerEvent("analysis_failed", { userId: user.id, ticker: canonicalCompany.ticker });
    return null;
  });

  if (!result) {
    return Response.json(
      { ok: false, error: "Analysis is temporarily unavailable. Please try again shortly." },
      { status: 503 }
    );
  }

  if (!result.ok) {
    if (quotaReservationId) {
      await releaseAnalysisReservation({ reservationId: quotaReservationId, status: "failed" });
    }
    await recordProviderDiagnostics(result.providerDiagnostics ?? [], "analysis_failed").catch(() => undefined);
    await recordUsageEvent({
      userId: user.id,
      event: "analysis_failed",
      metadata: { ticker: canonicalCompany.ticker, errorCode: publicDiagnosticCode(result.error, "provider_unavailable") }
    });
    captureServerEvent("analysis_failed", { userId: user.id, ticker: canonicalCompany.ticker });
    return Response.json(
      { ok: false, error: "Analysis is temporarily unavailable. Please try again shortly." },
      { status: 503 }
    );
  }

  await recordAnalysisObservability({ userId: user.id, report: result.data }).catch(async (error) => {
    await logApplicationError({
      service: "analysis-observability",
      message: sanitizeDiagnosticMessage(error, "Analysis observability failed unexpectedly."),
      userId: user.id,
      context: { ticker: result.data.ticker, stage: "observability" }
    }).catch(() => undefined);
  });

  const persisted = await persistAnalysis({
    userId: user.id,
    report: result.data,
    rawProviderWarnings: result.warnings,
    idempotencyKey,
    requestFingerprint
  }).catch(async (error) => {
    const message = sanitizeDiagnosticMessage(error, "Analysis persistence failed unexpectedly.");
    if (quotaReservationId) {
      await releaseAnalysisReservation({ reservationId: quotaReservationId, status: "failed" });
    }
    await logApplicationError({
      service: "analysis-api",
      message,
      userId: user.id,
      context: { ticker: result.data.ticker, stage: "persistence" }
    });
    await recordUsageEvent({
      userId: user.id,
      event: "analysis_failed",
      metadata: { ticker: result.data.ticker, errorCode: publicDiagnosticCode(error, "persistence_exception") }
    });
    captureServerEvent("analysis_failed", { userId: user.id, ticker: result.data.ticker });
    return null;
  });

  if (!persisted) {
    return Response.json(
      { ok: false, error: "Analysis completed but could not be saved. Try again." },
      { status: 503 }
    );
  }

  if (persisted.ok) {
    if ("replayed" in persisted && persisted.replayed) {
      if (quotaReservationId) {
        await releaseAnalysisReservation({ reservationId: quotaReservationId, status: "released" });
      }
      const replayData = { ...persisted.report, id: persisted.id };
      if (user.role !== "admin") delete replayData.adminQa;
      return Response.json({ ok: true, data: replayData, sources: [], warnings: result.warnings, persisted: true, replayed: true });
    }
    result.data.id = persisted.id;
    if (quotaReservationId) {
      await completeAnalysisReservation({ reservationId: quotaReservationId, analysisId: persisted.id });
    }
  } else {
    if (persisted.conflict) {
      if (quotaReservationId) {
        await releaseAnalysisReservation({ reservationId: quotaReservationId, status: "released" });
      }
      return Response.json({ error: "This analysis retry key belongs to a different request." }, { status: 409 });
    }
    const persistenceMessage = sanitizeDiagnosticMessage(persisted.error, "Analysis persistence failed.");
    if (quotaReservationId) {
      await releaseAnalysisReservation({ reservationId: quotaReservationId, status: "failed" });
    }
    await logApplicationError({
      service: "analysis-api",
      message: persistenceMessage,
      userId: user.id,
      context: { ticker: result.data.ticker }
    });
    await recordUsageEvent({
      userId: user.id,
      event: "analysis_failed",
      metadata: { ticker: result.data.ticker, errorCode: publicDiagnosticCode(persisted.error, "persistence_failed") }
    });
    captureServerEvent("analysis_failed", { userId: user.id, ticker: result.data.ticker });
    return Response.json(
      {
        ok: false,
        error: "Analysis completed but could not be saved. Try again.",
        warnings: result.warnings
      },
      { status: 503 }
    );
  }

  const researchView = researchViewForReport(result.data);
  await recordUsageEvent({
    userId: user.id,
    event: "analysis_completed",
    metadata: {
      ticker: result.data.ticker,
      score: result.data.score.score,
      researchView
    }
  });

  captureServerEvent("analysis_completed", {
    userId: user.id,
    ticker: result.data.ticker,
    score: result.data.score.score,
    researchView
  });

  try {
    await sendStrongResearchAlert(
      result.data,
      `${getServerEnv().NEXT_PUBLIC_APP_URL}/admin?analysis=${encodeURIComponent(result.data.id)}`
    );
  } catch (error) {
    await logApplicationError({
      service: "admin-alerts",
      message: sanitizeDiagnosticMessage(error, "Strong research-view alert failed unexpectedly."),
      userId: user.id,
      context: {
        ticker: result.data.ticker,
        analysisId: result.data.id
      }
    });
  }

  if (user.role !== "admin") delete result.data.adminQa;

  return Response.json({ ...result, persisted: persisted.ok });
}