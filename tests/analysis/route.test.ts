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
  searchCompanies: vi.fn(),
  sendStrongBuyAlert: vi.fn()
}));

vi.mock("@/lib/analytics/events", () => ({
  captureServerEvent: mocks.captureServerEvent
}));
vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: mocks.getCurrentUser
}));
vi.mock("@/lib/data/provider", () => ({
  analyzeCompany: mocks.analyzeCompany,
  searchCompanies: mocks.searchCompanies
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
  getServerEnv: vi.fn(() => ({ NEXT_PUBLIC_APP_URL: "https://stockbox.test" })),
  isSupabaseConfigured: vi.fn(() => false)
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
      company: {
        ticker: "BOX",
        name: "Box Systems",
        securityType: "Common Stock",
        providerCapabilities: {
          fundamentals: true,
          marketData: true,
          providerIds: ["test-fundamentals"]
        }
      },
      analysisType,
      investmentProfile: "balanced"
    })
  });
}

function companyRequest(company: Record<string, unknown>) {
  return new Request("http://localhost/api/analysis", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      company,
      analysisType: "summary",
      investmentProfile: "balanced"
    })
  });
}

function unsupportedAnalysisRequest() {
  return new Request("http://localhost/api/analysis", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      company: {
        ticker: "SPY",
        name: "SPDR S&P 500 ETF Trust",
        securityType: "ETF/Fund",
        providerCapabilities: {
          fundamentals: false,
          marketData: true,
          providerIds: ["yahoo-search"]
        }
      },
      analysisType: "summary",
      investmentProfile: "balanced"
    })
  });
}

function unsupportedAdrWithCikRequest() {
  return new Request("http://localhost/api/analysis", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      company: {
        ticker: "NVO",
        name: "Novo Nordisk A/S ADR",
        cik: "0000353278",
        securityType: "ADR"
      },
      analysisType: "summary",
      investmentProfile: "balanced"
    })
  });
}

function unsupportedAdrWithoutSecurityTypeRequest() {
  return new Request("http://localhost/api/analysis", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      company: {
        ticker: "NVO",
        name: "Novo Nordisk A/S ADR",
        cik: "0000353278"
      },
      analysisType: "summary",
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
    recommendation: "Buy",
    adminQa: {
      providerFailures: [], fallbacks: [], missingDataReasons: [], classificationDiagnostics: null,
      timingsMs: { total: 1 }, sourceConflicts: [], providerAttempts: [], selectedProviders: [],
      currencyState: "aligned", specializedCoverage: 1, valuationSupport: "directional",
    }
  } as unknown as AnalysisReport;
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
    mocks.searchCompanies.mockImplementation(async (query: string) => {
      if (query === "BOX") {
        return [{
          securityId: "security:box-common",
          issuerId: "issuer:box",
          ticker: "BOX",
          canonicalTicker: "BOX",
          name: "Box Systems",
          cik: "0001000001",
          entityId: "sec:0001000001",
          country: "US",
          currency: "USD",
          securityType: "Common Stock",
          primaryCandidate: true,
          providerCapabilities: {
            fundamentals: true,
            marketData: true,
            providerIds: ["test-fundamentals"]
          }
        }];
      }
      if (query === "SPY") {
        return [{
          securityId: "security:spy-fund",
          ticker: "SPY",
          canonicalTicker: "SPY",
          name: "SPDR S&P 500 ETF Trust",
          securityType: "ETF/Fund",
          primaryCandidate: true,
          providerCapabilities: {
            fundamentals: false,
            marketData: true,
            providerIds: ["yahoo-search"]
          }
        }];
      }
      if (query === "NVO") {
        return [{
          securityId: "security:nvo-adr",
          ticker: "NVO",
          canonicalTicker: "NVO",
          name: "Novo Nordisk A/S ADR",
          cik: "0000353278",
          entityId: "sec:0000353278",
          securityType: "ADR",
          primaryCandidate: true,
          providerCapabilities: {
            fundamentals: false,
            marketData: true,
            providerIds: ["yahoo-search"]
          }
        }];
      }
      return [];
    });
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

  it("denies anonymous malformed analysis requests before validation details are exposed", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const request = new Request("http://localhost/api/analysis", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: "{}"
    });
    const response = await POST(request);
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Sign in to run an analysis." });
    expect(mocks.reserveAnalysisEntitlement).not.toHaveBeenCalled();
    expect(mocks.searchCompanies).not.toHaveBeenCalled();
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

  it("rejects unsupported securities before quota reservation or provider work", async () => {
    const response = await POST(unsupportedAnalysisRequest());
    const payload = await response.json();

    expect(response.status).toBe(422);
    expect(payload).toEqual({
      error: "Live fundamentals are not available for this security."
    });
    expect(mocks.reserveAnalysisEntitlement).not.toHaveBeenCalled();
    expect(mocks.analyzeCompany).not.toHaveBeenCalled();
    expect(mocks.persistAnalysis).not.toHaveBeenCalled();
  });

  it("rejects ADR requests even when a CIK is present and provider capabilities are omitted", async () => {
    const response = await POST(unsupportedAdrWithCikRequest());
    const payload = await response.json();

    expect(response.status).toBe(422);
    expect(payload).toEqual({
      error: "Live fundamentals are not available for this security."
    });
    expect(mocks.reserveAnalysisEntitlement).not.toHaveBeenCalled();
    expect(mocks.analyzeCompany).not.toHaveBeenCalled();
    expect(mocks.persistAnalysis).not.toHaveBeenCalled();
  });

  it("rejects omitted-securityType ADR requests by inferring the unsupported security from the name", async () => {
    const response = await POST(unsupportedAdrWithoutSecurityTypeRequest());
    const payload = await response.json();

    expect(response.status).toBe(422);
    expect(payload).toEqual({
      error: "Live fundamentals are not available for this security."
    });
    expect(mocks.reserveAnalysisEntitlement).not.toHaveBeenCalled();
    expect(mocks.analyzeCompany).not.toHaveBeenCalled();
    expect(mocks.persistAnalysis).not.toHaveBeenCalled();
  });

  it("rejects a ticker paired with another issuer CIK before quota or provider analysis", async () => {
    mocks.searchCompanies.mockResolvedValueOnce([{
      securityId: "security:aapl-common",
      ticker: "AAPL",
      canonicalTicker: "AAPL",
      name: "Apple Inc.",
      cik: "0000320193",
      entityId: "sec:0000320193",
      currency: "USD",
      country: "US",
      securityType: "Common Stock",
      primaryCandidate: true,
      providerCapabilities: { fundamentals: true, marketData: true, providerIds: ["sec"] }
    }]);

    const response = await POST(companyRequest({
      ticker: "AAPL",
      canonicalTicker: "AAPL",
      name: "Apple Inc.",
      cik: "0000789019",
      entityId: "sec:0000320193"
    }));

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "Selected company identity could not be verified." });
    expect(mocks.reserveAnalysisEntitlement).not.toHaveBeenCalled();
    expect(mocks.analyzeCompany).not.toHaveBeenCalled();
  });

  it("rejects a ticker paired with another company entityId", async () => {
    mocks.searchCompanies.mockResolvedValueOnce([{
      securityId: "security:aapl-common",
      ticker: "AAPL",
      canonicalTicker: "AAPL",
      name: "Apple Inc.",
      cik: "0000320193",
      entityId: "sec:0000320193",
      currency: "USD",
      country: "US",
      securityType: "Common Stock",
      primaryCandidate: true,
      providerCapabilities: { fundamentals: true, marketData: true, providerIds: ["sec"] }
    }]);

    const response = await POST(companyRequest({
      ticker: "AAPL",
      canonicalTicker: "AAPL",
      name: "Apple Inc.",
      cik: "0000320193",
      entityId: "sec:0000789019"
    }));

    expect(response.status).toBe(409);
    expect(mocks.analyzeCompany).not.toHaveBeenCalled();
  });

  it("uses server-resolved reporting metadata instead of browser currency or country", async () => {
    mocks.searchCompanies.mockResolvedValueOnce([{
      securityId: "security:aapl-common",
      ticker: "AAPL",
      canonicalTicker: "AAPL",
      name: "Apple Inc.",
      cik: "0000320193",
      entityId: "sec:0000320193",
      currency: "USD",
      country: "US",
      securityType: "Common Stock",
      primaryCandidate: true,
      providerCapabilities: { fundamentals: true, marketData: true, providerIds: ["sec"] }
    }]);

    const response = await POST(companyRequest({
      ticker: "AAPL",
      canonicalTicker: "AAPL",
      name: "Browser supplied name",
      cik: "0000320193",
      entityId: "sec:0000320193",
      currency: "EUR",
      country: "DE"
    }));

    expect(response.status).toBe(200);
    expect(mocks.analyzeCompany).toHaveBeenCalledWith(expect.objectContaining({
      company: expect.objectContaining({
        name: "Apple Inc.",
        currency: "USD",
        country: "US"
      })
    }));
  });

  it("rejects an ambiguous exact listing when no stable security id resolves it", async () => {
    mocks.searchCompanies.mockResolvedValueOnce([
      {
        ticker: "ABC",
        canonicalTicker: "ABC",
        name: "ABC Holdings US",
        entityId: "issuer:abc-us",
        country: "US",
        securityType: "Common Stock",
        matchConfidence: "high",
        providerCapabilities: { fundamentals: true, marketData: true, providerIds: ["sec"] }
      },
      {
        ticker: "ABC",
        canonicalTicker: "ABC",
        name: "ABC Holdings Canada",
        entityId: "issuer:abc-ca",
        country: "CA",
        securityType: "Common Stock",
        matchConfidence: "high",
        providerCapabilities: { fundamentals: true, marketData: true, providerIds: ["yahoo"] }
      }
    ]);

    const response = await POST(companyRequest({ ticker: "ABC", name: "ABC" }));

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "Selected company identity is ambiguous. Search and select the exact listing again." });
    expect(mocks.analyzeCompany).not.toHaveBeenCalled();
  });

  it("uses a stable security id to resolve one listing among otherwise ambiguous exact tickers", async () => {
    mocks.searchCompanies.mockResolvedValueOnce([
      {
        securityId: "security:abc-us",
        ticker: "ABC",
        canonicalTicker: "ABC",
        name: "ABC Holdings US",
        entityId: "issuer:abc-us",
        country: "US",
        securityType: "Common Stock",
        providerCapabilities: { fundamentals: true, marketData: true, providerIds: ["sec"] }
      },
      {
        securityId: "security:abc-ca",
        ticker: "ABC",
        canonicalTicker: "ABC",
        name: "ABC Holdings Canada",
        entityId: "issuer:abc-ca",
        country: "CA",
        securityType: "Common Stock",
        providerCapabilities: { fundamentals: true, marketData: true, providerIds: ["yahoo"] }
      }
    ]);

    const response = await POST(companyRequest({
      securityId: "security:abc-ca",
      ticker: "ABC",
      canonicalTicker: "ABC",
      name: "ABC Holdings Canada"
    }));

    expect(response.status).toBe(200);
    expect(mocks.analyzeCompany).toHaveBeenCalledWith(expect.objectContaining({
      company: expect.objectContaining({ securityId: "security:abc-ca", country: "CA" })
    }));
  });

  it("accepts a configured predecessor CIK but analyzes the canonical successor entity", async () => {
    mocks.searchCompanies.mockResolvedValueOnce([{
      securityId: "security:xom-common",
      ticker: "XOM",
      canonicalTicker: "XOM",
      name: "Exxon Mobil Corporation",
      cik: "0002115436",
      entityId: "economic-company:xom",
      country: "US",
      currency: "USD",
      securityType: "Common Stock",
      primaryCandidate: true,
      providerCapabilities: { fundamentals: true, marketData: true, providerIds: ["sec"] }
    }]);

    const response = await POST(companyRequest({
      ticker: "XOM",
      canonicalTicker: "XOM",
      name: "Exxon Mobil Corporation",
      cik: "0000034088",
      entityId: "economic-company:xom"
    }));

    expect(response.status).toBe(200);
    expect(mocks.analyzeCompany).toHaveBeenCalledWith(expect.objectContaining({
      company: expect.objectContaining({
        cik: "0002115436",
        entityId: "economic-company:xom"
      })
    }));
  });

  it("blocks a preferred listing even when the browser labels it as common stock", async () => {
    mocks.searchCompanies.mockResolvedValueOnce([{
      securityId: "security:jpm-pd",
      ticker: "JPM-PD",
      canonicalTicker: "JPM-PD",
      name: "JPMorgan Chase Depositary Shares Series D",
      cik: "0000019617",
      entityId: "sec:0000019617",
      country: "US",
      currency: "USD",
      securityType: "Preferred",
      primaryCandidate: true,
      providerCapabilities: { fundamentals: false, marketData: true, providerIds: ["yahoo"] }
    }]);

    const response = await POST(companyRequest({
      ticker: "JPM-PD",
      canonicalTicker: "JPM-PD",
      name: "JPMorgan Chase",
      cik: "0000019617",
      securityType: "Common Stock",
      providerCapabilities: { fundamentals: true, marketData: true, providerIds: ["sec"] }
    }));

    expect(response.status).toBe(422);
    expect(mocks.reserveAnalysisEntitlement).not.toHaveBeenCalled();
    expect(mocks.analyzeCompany).not.toHaveBeenCalled();
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

  it.each<AnalysisType>(["summary", "numbers", "deep", "research"])(
    "keeps admin quota-exempt for %s analyses",
    async (analysisType) => {
      mocks.getCurrentUser.mockResolvedValue({
        id: "admin_1",
        email: "owner@stockbox.test",
        role: "admin"
      });
      mocks.reserveAnalysisEntitlement.mockResolvedValue(
        deniedEntitlement("free", analysisType)
      );

      const response = await POST(analysisRequest(analysisType));
      const payload = await response.json();

      expect(response.status).toBe(200);
      expect(payload.data.adminQa).toBeDefined();
      expect(mocks.reserveAnalysisEntitlement).not.toHaveBeenCalled();
      expect(mocks.analyzeCompany).toHaveBeenCalledWith(
        expect.objectContaining({ analysisType })
      );
      expect(mocks.persistAnalysis).toHaveBeenCalledWith(expect.objectContaining({
        userId: "admin_1",
        rawProviderWarnings: []
      }));
    }
  );

  it("does not expose Admin QA diagnostics in a customer response", async () => {
    const response = await POST(analysisRequest());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data.adminQa).toBeUndefined();
  });

  it("releases the quota reservation and does not expose provider internals when the provider run fails", async () => {
    mocks.analyzeCompany.mockResolvedValue({
      ok: false,
      error: "upstream provider secret: token=internal-debug-value",
      sources: [],
      warnings: ["provider diagnostic detail"]
    });

    const response = await POST(analysisRequest("research"));
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload).toEqual({
      ok: false,
      error: "Analysis is temporarily unavailable. Please try again shortly."
    });
    expect(JSON.stringify(payload)).not.toContain("internal-debug-value");
    expect(JSON.stringify(payload)).not.toContain("provider diagnostic detail");
    expect(mocks.releaseAnalysisReservation).toHaveBeenCalledWith({
      reservationId: "quota-reservation-1",
      status: "failed"
    });
    expect(mocks.persistAnalysis).not.toHaveBeenCalled();
    expect(mocks.recordUsageEvent).toHaveBeenCalledWith({
      userId: "user_1",
      event: "analysis_failed",
      metadata: { ticker: "BOX", errorCode: "provider_unavailable" }
    });
    expect(JSON.stringify(mocks.recordUsageEvent.mock.calls)).not.toContain("internal-debug-value");
  });

  it("releases the quota reservation when the provider throws unexpectedly", async () => {
    mocks.analyzeCompany.mockRejectedValue(new Error("provider crashed unexpectedly token=super-secret-provider-token"));

    const response = await POST(analysisRequest("research"));
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload).toEqual({
      ok: false,
      error: "Analysis is temporarily unavailable. Please try again shortly."
    });
    expect(mocks.releaseAnalysisReservation).toHaveBeenCalledWith({
      reservationId: "quota-reservation-1",
      status: "failed"
    });
    expect(mocks.persistAnalysis).not.toHaveBeenCalled();
    expect(mocks.recordUsageEvent).toHaveBeenCalledWith({
      userId: "user_1",
      event: "analysis_failed",
      metadata: { ticker: "BOX", errorCode: "analysis_exception" }
    });
    expect(JSON.stringify(mocks.recordUsageEvent.mock.calls)).not.toContain("super-secret-provider-token");
    expect(mocks.logApplicationError).toHaveBeenCalledWith({
      service: "analysis-api",
      message: "provider crashed unexpectedly token=[redacted]",
      userId: "user_1",
      context: { ticker: "BOX", stage: "analysis" }
    });
  });

  it("returns a failure without completion side effects when persistence fails", async () => {
    mocks.analyzeCompany.mockResolvedValue({
      ok: true,
      data: {
        ...report("summary"),
        recommendation: "Strong Buy"
      },
      sources: [],
      warnings: ["Market price history is unavailable."]
    });
    mocks.persistAnalysis.mockResolvedValue({
      ok: false,
      error: "database unavailable"
    });

    const response = await POST(analysisRequest());
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload).toMatchObject({
      ok: false,
      error: "Analysis completed but could not be saved. Try again."
    });
    expect(mocks.releaseAnalysisReservation).toHaveBeenCalledWith({
      reservationId: "quota-reservation-1",
      status: "failed"
    });
    expect(mocks.completeAnalysisReservation).not.toHaveBeenCalled();
    expect(mocks.recordUsageEvent).toHaveBeenCalledWith({
      userId: "user_1",
      event: "analysis_failed",
      metadata: { ticker: "BOX", errorCode: "persistence_failed" }
    });
    expect(mocks.captureServerEvent).toHaveBeenCalledWith("analysis_failed", {
      userId: "user_1",
      ticker: "BOX"
    });
    expect(mocks.recordUsageEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ event: "analysis_completed" })
    );
    expect(mocks.captureServerEvent).not.toHaveBeenCalledWith(
      "analysis_completed",
      expect.anything()
    );
    expect(mocks.sendStrongBuyAlert).not.toHaveBeenCalled();
  });

  it("releases the quota reservation when persistence throws unexpectedly", async () => {
    mocks.persistAnalysis.mockRejectedValue(new Error("database connection crashed"));

    const response = await POST(analysisRequest());
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload).toEqual({
      ok: false,
      error: "Analysis completed but could not be saved. Try again."
    });
    expect(mocks.releaseAnalysisReservation).toHaveBeenCalledWith({
      reservationId: "quota-reservation-1",
      status: "failed"
    });
    expect(mocks.completeAnalysisReservation).not.toHaveBeenCalled();
    expect(mocks.recordUsageEvent).toHaveBeenCalledWith({
      userId: "user_1",
      event: "analysis_failed",
      metadata: { ticker: "BOX", errorCode: "persistence_exception" }
    });
    expect(mocks.logApplicationError).toHaveBeenCalledWith({
      service: "analysis-api",
      message: "database connection crashed",
      userId: "user_1",
      context: { ticker: "BOX", stage: "persistence" }
    });
  });

  it("keeps the saved analysis successful when optional admin alert delivery fails", async () => {
    mocks.analyzeCompany.mockResolvedValue({
      ok: true,
      data: {
        ...report("summary"),
        recommendation: "Strong Buy"
      },
      sources: [],
      warnings: []
    });
    mocks.sendStrongBuyAlert.mockRejectedValue(new Error("email provider timeout"));

    const response = await POST(analysisRequest());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      ok: true,
      persisted: true,
      data: { id: "persisted-analysis-id" }
    });
    expect(mocks.completeAnalysisReservation).toHaveBeenCalledWith({
      reservationId: "quota-reservation-1",
      analysisId: "persisted-analysis-id"
    });
    expect(mocks.releaseAnalysisReservation).not.toHaveBeenCalled();
    expect(mocks.recordUsageEvent).toHaveBeenCalledWith({
      userId: "user_1",
      event: "analysis_completed",
      metadata: {
        ticker: "BOX",
        score: 88,
        recommendation: "Strong Buy"
      }
    });
    expect(mocks.logApplicationError).toHaveBeenCalledWith({
      service: "admin-alerts",
      message: "email provider timeout",
      userId: "user_1",
      context: {
        ticker: "BOX",
        analysisId: "persisted-analysis-id"
      }
    });
  });

  it("rate limits excessive authenticated analysis requests before provider work", async () => {
    mocks.getCurrentUser.mockResolvedValue({
      id: "rate_user",
      email: "rate@stockbox.test",
      role: "customer"
    });

    const responses: Response[] = [];
    for (let index = 0; index < 81; index += 1) {
      responses.push(await POST(analysisRequest()));
    }

    expect(responses.at(-1)?.status).toBe(429);
    await expect(responses.at(-1)?.json()).resolves.toEqual({
      error: "Too many requests. Please try again shortly."
    });
    expect(mocks.analyzeCompany).toHaveBeenCalledTimes(80);
    expect(mocks.reserveAnalysisEntitlement).toHaveBeenCalledTimes(80);
    expect(mocks.persistAnalysis).toHaveBeenCalledTimes(80);
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
