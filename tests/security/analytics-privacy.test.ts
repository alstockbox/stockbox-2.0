import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getServerEnv: vi.fn(),
}));

vi.mock("@/lib/env/server", () => ({ getServerEnv: mocks.getServerEnv }));

import { captureServerEvent } from "../../src/lib/analytics/events";

describe("analytics privacy boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getServerEnv.mockReturnValue({
      NEXT_PUBLIC_POSTHOG_KEY: "phc_test",
      NEXT_PUBLIC_POSTHOG_HOST: "https://analytics.example.test",
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 200 })));
  });

  it("hashes user identity and drops raw or sensitive properties", () => {
    captureServerEvent("analysis_completed", {
      userId: "user-123", ticker: "AAPL", score: 88, recommendation: "Buy",
      email: "person@example.com", token: "secret-token", reportBody: "private report",
      analysisId: "analysis-123",
    });

    expect(fetch).toHaveBeenCalledOnce();
    const init = vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit;
    const payload = JSON.parse(String(init.body));
    expect(payload.properties.distinct_id).toMatch(/^[a-f0-9]{64}$/);
    expect(payload.properties.distinct_id).not.toContain("user-123");
    expect(payload.properties).toMatchObject({ ticker: "AAPL", score: 88, recommendation: "Buy" });    expect(payload.properties).not.toHaveProperty("userId");
    expect(payload.properties).not.toHaveProperty("email");
    expect(payload.properties).not.toHaveProperty("token");
    expect(payload.properties).not.toHaveProperty("reportBody");
    expect(payload.properties).not.toHaveProperty("analysisId");
  });

  it("does not send arbitrary company-search text", () => {
    captureServerEvent("company_searched", { query: "person@example.com", resultCount: 3 });
    const init = vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit;
    const payload = JSON.parse(String(init.body));
    expect(payload.properties).toMatchObject({ distinct_id: "anonymous", resultCount: 3 });
    expect(payload.properties).not.toHaveProperty("query");
  });

  it("does nothing when analytics is disabled", () => {
    mocks.getServerEnv.mockReturnValue({ NEXT_PUBLIC_POSTHOG_KEY: undefined, NEXT_PUBLIC_POSTHOG_HOST: "https://example.test" });
    captureServerEvent("landing_view", { userId: "user-123" });
    expect(fetch).not.toHaveBeenCalled();
  });
});