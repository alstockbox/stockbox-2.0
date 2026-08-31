import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  order: vi.fn(),
  range: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));

import { getUserAnalysisHistory } from "../../src/lib/db/repositories";

describe("saved analysis history repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.range.mockResolvedValue({
      data: [{
        id: "analysis-8", ticker: "AAPL", company_name: "Apple Inc.", recommendation: "Hold",
        analysis_type: "summary", score: 72, confidence: 84, data_coverage: 0.92,
        model_version: "stockbox-analysis-engine-v2.7.0",
        generated_at: "2026-08-28T07:59:00.000Z",
        created_at: "2026-08-28T08:00:00.000Z",
      }],
      count: 30,
      error: null,
    });
    mocks.order.mockReturnValue({ range: mocks.range });
    mocks.eq.mockReturnValue({ order: mocks.order });
    mocks.select.mockReturnValue({ eq: mocks.eq });
    mocks.createAdminClient.mockReturnValue({ from: vi.fn(() => ({ select: mocks.select })) });
  });
  it("returns the exact total while limiting the dashboard preview to eight analyses", async () => {
    await expect(getUserAnalysisHistory({ userId: "user_1", page: 1, pageSize: 8 })).resolves.toMatchObject({
      ok: true,
      count: 30,
      data: [{ id: "analysis-8" }],
    });
    expect(mocks.select).toHaveBeenCalledWith(
      "id,ticker,company_name,analysis_type,recommendation,score,confidence,data_coverage,model_version,generated_at:report->>generatedAt,created_at",
      { count: "exact" },
    );
    expect(mocks.eq).toHaveBeenCalledWith("user_id", "user_1");
    expect(mocks.order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(mocks.range).toHaveBeenCalledWith(0, 7);
  });

  it("paginates history without dropping the authenticated user filter", async () => {
    await getUserAnalysisHistory({ userId: "user_1", page: 2, pageSize: 8 });
    expect(mocks.eq).toHaveBeenCalledWith("user_id", "user_1");
    expect(mocks.range).toHaveBeenCalledWith(8, 15);
  });
});
