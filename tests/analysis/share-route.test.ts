import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  captureServerEvent: vi.fn(),
  getCurrentUser: vi.fn(),
  createAdminClient: vi.fn(),
  from: vi.fn(),
  analysesSelect: vi.fn(),
  analysesEq: vi.fn(),
  analysesSingle: vi.fn(),
  shareInsert: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/analytics/events", () => ({
  captureServerEvent: mocks.captureServerEvent,
}));
vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));

import { POST } from "../../src/app/api/share/route";

const analysisId = "00000000-0000-4000-8000-000000000001";

function shareRequest() {
  return new Request("http://localhost/api/share", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ analysisId }),
  });
}

describe("share API", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    const analysesQuery = {
      select: mocks.analysesSelect,
      eq: mocks.analysesEq,
      single: mocks.analysesSingle,
    };
    mocks.analysesSelect.mockReturnValue(analysesQuery);
    mocks.analysesEq.mockReturnValue(analysesQuery);
    mocks.analysesSingle.mockResolvedValue({ data: { id: analysisId } });

    const shareLinksQuery = {
      insert: mocks.shareInsert,
    };
    mocks.shareInsert.mockResolvedValue({ error: null });

    mocks.from.mockImplementation((table: string) => table === "analyses" ? analysesQuery : shareLinksQuery);
    let rateCount = 0;
    mocks.rpc.mockImplementation(async () => {
      rateCount += 1;
      return {
        data: {
          allowed: rateCount <= 30,
          remaining: Math.max(30 - rateCount, 0),
          reset_at: "2026-08-29T18:00:00.000Z",
          retry_after_seconds: rateCount <= 30 ? 0 : 60,
        },
        error: null,
      };
    });
    mocks.createAdminClient.mockReturnValue({ from: mocks.from, rpc: mocks.rpc });
    mocks.getCurrentUser.mockResolvedValue({
      id: "share_rate_user",
      email: "share-rate@stockbox.test",
      role: "customer",
    });
  });

  it("rate limits repeated share creation before database lookups and writes", async () => {
    const responses: Response[] = [];
    for (let index = 0; index < 31; index += 1) {
      responses.push(await POST(shareRequest()));
    }

    expect(responses.at(-1)?.status).toBe(429);
    await expect(responses.at(-1)?.json()).resolves.toEqual({
      error: "Too many requests. Please try again shortly.",
    });
    expect(mocks.from).toHaveBeenCalledTimes(60);
    expect(mocks.shareInsert).toHaveBeenCalledTimes(30);
    expect(mocks.captureServerEvent).toHaveBeenCalledTimes(30);
  });

  it("does not expose raw database errors when share creation fails", async () => {
    mocks.getCurrentUser.mockResolvedValue({
      id: "share_error_user",
      email: "share-error@stockbox.test",
      role: "customer",
    });
    mocks.shareInsert.mockResolvedValue({
      error: { message: "duplicate key value violates unique constraint share_links_token_key" },
    });

    const response = await POST(shareRequest());
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload).toEqual({
      error: "Sharing is temporarily unavailable. Please try again shortly.",
    });
    expect(JSON.stringify(payload)).not.toContain("duplicate key");
    expect(JSON.stringify(payload)).not.toContain("share_links");
    expect(mocks.captureServerEvent).not.toHaveBeenCalled();
  });
});
