import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  captureServerEvent: vi.fn(),
  searchCompanies: vi.fn(),
}));

vi.mock("@/lib/analytics/events", () => ({
  captureServerEvent: mocks.captureServerEvent,
}));
vi.mock("@/lib/data/provider", () => ({
  searchCompanies: mocks.searchCompanies,
}));

import { GET } from "../../src/app/api/companies/search/route";

function searchRequest(query = "AAPL", ip = "203.0.113.60") {
  return new Request(`http://localhost/api/companies/search?q=${encodeURIComponent(query)}`, {
    headers: { "x-forwarded-for": ip },
  });
}

describe("company search API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.searchCompanies.mockResolvedValue([
      { ticker: "AAPL", canonicalTicker: "AAPL", name: "Apple Inc." },
    ]);
  });

  it("does not send raw free-text search queries to analytics", async () => {
    const sensitiveQuery = "person@example.com";
    const response = await GET(searchRequest(sensitiveQuery, "203.0.113.61"));

    expect(response.status).toBe(200);
    expect(mocks.captureServerEvent).toHaveBeenCalledWith("company_searched", {
      queryLength: sensitiveQuery.length,
      resultCount: 1,
    });
    expect(JSON.stringify(mocks.captureServerEvent.mock.calls)).not.toContain(sensitiveQuery);
  });

  it("rate limits repeated public search before provider work", async () => {
    const responses: Response[] = [];
    for (let index = 0; index < 61; index += 1) {
      responses.push(await GET(searchRequest()));
    }

    expect(responses.at(-1)?.status).toBe(429);
    await expect(responses.at(-1)?.json()).resolves.toEqual({
      error: "Too many requests. Please try again shortly.",
    });
    expect(mocks.searchCompanies).toHaveBeenCalledTimes(60);
    expect(mocks.captureServerEvent).toHaveBeenCalledTimes(60);
  });
});
