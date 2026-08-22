import type { AnalysisReport, AnalysisType } from "../../src/lib/analysis/types";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  analyzeCompany: vi.fn(),
  captureServerEvent: vi.fn(),
  checkAnalysisEntitlement: vi.fn(),
  getCurrentUser: vi.fn(),
  logApplicationError: vi.fn(),
  persistAnalysis: vi.fn(),
  recordUsageEvent: vi.fn(),
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
  checkAnalysisEntitlement: mocks.checkAnalysisEntitlement,
  logApplicationError: mocks.logApplicationError,
  persistAnalysis: mocks.persistAnalysis,
  recordUsageEvent: mocks.recordUsageEvent
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

function deniedEntitlement(plan: "free" | "basic", analysisType: AnalysisType) {
  return {
    allowed: false as const,
    configured: true as const,
    plan,
    usage: {
      analyses: plan === "free" ? 5 : 30,
      deepAnalyses: analysisType === "deep" ? (plan === "free" ? 1 : 8) : 0
    },
    limits: {
      analyses: plan === "free" ? 5 : 30,
      deepAnalyses: plan === "free" ? 1 : 8
    }
  };
}

describe("analysis API admin entitlement bypass", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue({
      id: "admin_1",
      email: "owner@stockbox.test",
      role: "admin"
    });
    mocks.checkAnalysisEntitlement.mockResolvedValue(
      deniedEntitlement("free", "summary")
    );
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
    mocks.sendStrongBuyAlert.mockResolvedValue(undefined);
  });

  it("allows an admin analysis even when the quota would be exhausted", async () => {
    const response = await POST(analysisRequest());

    expect(response.status).toBe(200);
    expect(mocks.checkAnalysisEntitlement).not.toHaveBeenCalled();
    expect(mocks.analyzeCompany).toHaveBeenCalledOnce();
  });

  it("still blocks a Free customer at quota", async () => {
    mocks.getCurrentUser.mockResolvedValue({
      id: "free_1",
      email: "free@stockbox.test",
      role: "customer"
    });
    mocks.checkAnalysisEntitlement.mockResolvedValue(
      deniedEntitlement("free", "summary")
    );

    const response = await POST(analysisRequest());

    expect(response.status).toBe(429);
    expect(mocks.checkAnalysisEntitlement).toHaveBeenCalledWith({
      userId: "free_1",
      analysisType: "summary"
    });
    expect(mocks.analyzeCompany).not.toHaveBeenCalled();
    expect(mocks.captureServerEvent).toHaveBeenCalledWith("paywall_viewed", {
      userId: "free_1",
      analysisType: "summary",
      plan: "free"
    });
  });

  it("still blocks a Basic customer at quota", async () => {
    mocks.getCurrentUser.mockResolvedValue({
      id: "basic_1",
      email: "basic@stockbox.test",
      role: "customer"
    });
    mocks.checkAnalysisEntitlement.mockResolvedValue(
      deniedEntitlement("basic", "summary")
    );

    const response = await POST(analysisRequest());

    expect(response.status).toBe(429);
    expect(mocks.checkAnalysisEntitlement).toHaveBeenCalledWith({
      userId: "basic_1",
      analysisType: "summary"
    });
    expect(mocks.analyzeCompany).not.toHaveBeenCalled();
  });

  it("allows unlimited deep analyses for admins", async () => {
    mocks.checkAnalysisEntitlement.mockResolvedValue(
      deniedEntitlement("basic", "deep")
    );

    const response = await POST(analysisRequest("deep"));

    expect(response.status).toBe(200);
    expect(mocks.checkAnalysisEntitlement).not.toHaveBeenCalled();
    expect(mocks.analyzeCompany).toHaveBeenCalledWith(
      expect.objectContaining({ analysisType: "deep" })
    );
  });

  it("still persists admin analyses and records usage and analytics", async () => {
    const response = await POST(analysisRequest());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      ok: true,
      persisted: true,
      data: { id: "persisted-analysis-id" }
    });
    expect(mocks.persistAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "admin_1",
        rawProviderWarnings: []
      })
    );
    expect(mocks.recordUsageEvent).toHaveBeenCalledWith({
      userId: "admin_1",
      event: "analysis_completed",
      metadata: {
        ticker: "BOX",
        score: 88,
        recommendation: "Buy"
      }
    });
    expect(mocks.captureServerEvent).toHaveBeenCalledWith("analysis_started", {
      userId: "admin_1",
      ticker: "BOX",
      analysisType: "summary"
    });
    expect(mocks.captureServerEvent).toHaveBeenCalledWith("analysis_completed", {
      userId: "admin_1",
      ticker: "BOX",
      score: 88,
      recommendation: "Buy"
    });
    expect(mocks.sendStrongBuyAlert).toHaveBeenCalledOnce();
  });
});
