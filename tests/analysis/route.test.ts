import type { AnalysisReport, AnalysisType } from "../../src/lib/analysis/types";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  analyzeCompany: vi.fn(),
  captureServerEvent: vi.fn(),
  completeAnalysisReservation: vi.fn(),
  getCurrentUser: vi.fn(),
  logApplicationError: vi.fn(),
  persistAnalysis: vi.fn(),
  recordUsageEvent: vi.fn(),
  releaseAnalysisReservation: vi.fn(),
  reserveAnalysisEntitlement: vi.fn(),
  sendStrongBuyAlert: vi.fn()
}));

vi.mock("@/lib/analytics/events", () => ({
  captureServerEvent: mocks.captureServerEvent
}));
vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: mocks.getCurrentUser
}));
vi.mock("@/lib/data/provider", () => ({
  analyzeCompany: mocks.analyzeCompany
}));
vi.mock("@/lib/db/repositories", () => ({
  completeAnalysisReservation: mocks.completeAnalysisReservation,
  logApplicationError: mocks.logApplicationError,
  persistAnalysis: mocks.persistAnalysis,
  recordUsageEvent: mocks.recordUsageEvent,
  releaseAnalysisReservation: mocks.releaseAnalysisReservation,
  reserveAnalysisEntitlement: mocks.reserveAnalysisEntitlement
}));
vi.mock("@/lib/env/server", () => ({
  getServerEnv: vi.fn(() => ({ NEXT_PUBLIC_APP_URL: "https://stockbox.test" }))
}));
vi.mock("@/lib/notifications/admin-alerts", () => ({
  sendStrongBuyAlert: mocks.sendStrongBuyAlert
}));

import { POST } from "../../src/app/api/analysis/route";

function analysisRequest(analysisType: AnalysisType = "summary") {
  return new Request("http://localhost/api/analysis", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      company: { ticker: "BOX", name: "Box Systems" },
      analysisType,
      investmentProfile: "balanced"
    })
  });
}

function report(analysisType: AnalysisType): AnalysisReport {
  return {
    id: "temporary-analysis-id",
    ticker: "BOX",
    companyName: "Box Systems",
    analysisType,
    investmentProfile: "balanced",
    score: { score: 88 },
    recommendation: "Buy"
  } as AnalysisReport;
}

function allowedEntitlement(plan: "free" | "basic" = "free", reservationId = "quota-reservation-1") {
  return {
    allowed: true as const,
    configured: true as const,
    plan,
    reservationId,
    usage: { analyses: 0, deepAnalyses: 0 },
    limits: {
      analyses: plan === "free" ? 5 : 30,
      deepAnalyses: plan === "free" ? 1 : 8
    }
  };
}

function deniedEntitlement(plan: "free" | "basic", analysisType: AnalysisType) {
  return {
    allowed: false as const,
    configured: true as const,
    plan,
    reservationId: null,
    usage: {
      analyses: plan === "free" ? 5 : 30,
      deepAnalyses: analysisType === "deep" || analysisType === "research" ? (plan === "free" ? 1 : 8) : 0
    },
    limits: {
      analyses: plan === "free" ? 5 : 30,
      deepAnalyses: plan === "free" ? 1 : 8
    }
  };
}

describe("analysis API authentication and entitlement enforcement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue({
      id: "user_1",
      email: "user@stockbox.test",
      role: "customer"
    });
    mocks.reserveAnalysisEntitlement.mockResolvedValue(allowedEntitlement());
    mocks.analyzeCompany.mockImplementation(
      async ({ analysisType }: { analysisType: AnalysisType }) => ({
        ok: true,
        data: report(analysisType),
        sources: [],
        warnings: []
      })
    );
    mocks.persistAnalysis.mockResolvedValue({
      ok: true,
      id: "persisted-analysis-id"
    });
    mocks.recordUsageEvent.mockResolvedValue(undefined);
    mocks.releaseAnalysisReservation.mockResolvedValue(undefined);
    mocks.completeAnalysisReservation.mockResolvedValue(undefined);
    mocks.sendStrongBuyAlert.mockResolvedValue(undefined);
  });

  it("denies anonymous analysis before provider calls or persistence", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);

    const response = await POST(analysisRequest());
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload).toEqual({ error: "Sign in to run an analysis." });
    expect(mocks.reserveAnalysisEntitlement).not.toHaveBeenCalled();
    expect(mocks.analyzeCompany).not.toHaveBeenCalled();
    expect(mocks.persistAnalysis).not.toHaveBeenCalled();
    expect(mocks.recordUsageEvent).not.toHaveBeenCalled();
  });

  it("allows a signed-in user within quota and completes the reservation", async () => {
    const response = await POST(analysisRequest());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      ok: true,
      persisted: true,
      data: { id: "persisted-analysis-id" }
    });
    expect(mocks.reserveAnalysisEntitlement).toHaveBeenCalledWith({
      userId: "user_1",
      analysisType: "summary"
    });
    expect(mocks.persistAnalysis).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user_1"
    }));
    expect(mocks.completeAnalysisReservation).toHaveBeenCalledWith({
      reservationId: "quota-reservation-1",
      analysisId: "persisted-analysis-id"
    });
  });

  it("blocks a Free customer at quota before provider calls", async () => {
    mocks.reserveAnalysisEntitlement.mockResolvedValue(
      deniedEntitlement("free", "summary")
    );

    const response = await POST(analysisRequest());

    expect(response.status).toBe(429);
    expect(mocks.reserveAnalysisEntitlement).toHaveBeenCalledWith({
      userId: "user_1",
      analysisType: "summary"
    });
    expect(mocks.analyzeCompany).not.toHaveBeenCalled();
    expect(mocks.captureServerEvent).toHaveBeenCalledWith("paywall_viewed", {
      userId: "user_1",
      analysisType: "summary",
      plan: "free"
    });
  });

  it("blocks a Basic customer at quota before provider calls", async () => {
    mocks.reserveAnalysisEntitlement.mockResolvedValue(
      deniedEntitlement("basic", "summary")
    );

    const response = await POST(analysisRequest());

    expect(response.status).toBe(429);
    expect(mocks.analyzeCompany).not.toHaveBeenCalled();
  });

  it("allows admin analyses without quota reservations", async () => {
    mocks.getCurrentUser.mockResolvedValue({
      id: "admin_1",
      email: "owner@stockbox.test",
      role: "admin"
    });
    mocks.reserveAnalysisEntitlement.mockResolvedValue(
      deniedEntitlement("free", "deep")
    );

    const response = await POST(analysisRequest("deep"));

    expect(response.status).toBe(200);
    expect(mocks.reserveAnalysisEntitlement).not.toHaveBeenCalled();
    expect(mocks.analyzeCompany).toHaveBeenCalledWith(
      expect.objectContaining({ analysisType: "deep" })
    );
    expect(mocks.persistAnalysis).toHaveBeenCalledWith(expect.objectContaining({
      userId: "admin_1",
      rawProviderWarnings: []
    }));
    expect(mocks.recordUsageEvent).toHaveBeenCalledWith({
      userId: "admin_1",
      event: "analysis_completed",
      metadata: {
        ticker: "BOX",
        score: 88,
        recommendation: "Buy"
      }
    });
  });

  it("releases the quota reservation when the provider run fails", async () => {
    mocks.analyzeCompany.mockResolvedValue({
      ok: false,
      error: "Provider unavailable.",
      sources: [],
      warnings: []
    });

    const response = await POST(analysisRequest("research"));

    expect(response.status).toBe(503);
    expect(mocks.releaseAnalysisReservation).toHaveBeenCalledWith({
      reservationId: "quota-reservation-1",
      status: "failed"
    });
    expect(mocks.persistAnalysis).not.toHaveBeenCalled();
    expect(mocks.recordUsageEvent).toHaveBeenCalledWith({
      userId: "user_1",
      event: "analysis_failed",
      metadata: { ticker: "BOX", error: "Provider unavailable." }
    });
  });

  it("does not let concurrent calls bypass reservation denial", async () => {
    mocks.reserveAnalysisEntitlement
      .mockResolvedValueOnce(allowedEntitlement("free", "reservation-a"))
      .mockResolvedValueOnce(deniedEntitlement("free", "summary"));

    const responses = await Promise.all([
      POST(analysisRequest()),
      POST(analysisRequest()),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([200, 429]);
    expect(mocks.reserveAnalysisEntitlement).toHaveBeenCalledTimes(2);
    expect(mocks.analyzeCompany).toHaveBeenCalledOnce();
  });
});
