import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchTwelveDataEstimateSnapshot } from "../../src/lib/data/twelve-data-estimates";

function json(value: unknown) {
  return new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } });
}

const company = { ticker: "AAPL", canonicalTicker: "AAPL", name: "Apple Inc.", currency: "USD" };

describe("Twelve Data analyst estimates adapter", () => {
  afterEach(() => vi.restoreAllMocks());

  it("derives next-year consensus growth and preserves EPS revision counts", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(json({
        meta: { symbol: "AAPL", currency: "USD" },
        earnings_estimate: [
          { date: "2026-09-30", period: "current_year", number_of_analysts: 35, avg_estimate: 7.0, low_estimate: 6.5, high_estimate: 7.5 },
          { date: "2027-09-30", period: "next_year", number_of_analysts: 36, avg_estimate: 8.4, low_estimate: 7.8, high_estimate: 9.1 },
        ],
        status: "ok",
      }))
      .mockResolvedValueOnce(json({
        meta: { symbol: "AAPL", currency: "USD" },
        revenue_estimate: [
          { date: "2026-09-30", period: "current_year", number_of_analysts: 38, avg_estimate: 400_000_000_000, low_estimate: 390_000_000_000, high_estimate: 410_000_000_000 },
          { date: "2027-09-30", period: "next_year", number_of_analysts: 39, avg_estimate: 440_000_000_000, low_estimate: 425_000_000_000, high_estimate: 455_000_000_000 },
        ],
        status: "ok",
      }))
      .mockResolvedValueOnce(json({
        meta: { symbol: "AAPL", currency: "USD" },
        eps_revision: [
          { date: "2026-09-30", period: "current_year", up_last_week: 3, up_last_month: 8, down_last_week: 1, down_last_month: 2 },
          { date: "2027-09-30", period: "next_year", up_last_week: 4, up_last_month: 10, down_last_week: 0, down_last_month: 3 },
        ],
        status: "ok",
      }));

    const result = await fetchTwelveDataEstimateSnapshot(company, "secret-key");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.diagnostic.status).toBe("available");
    expect(result.data.forwardEstimates.nextYearEpsGrowth).toBeCloseTo(0.2, 10);
    expect(result.data.forwardEstimates.nextYearRevenueGrowth).toBeCloseTo(0.1, 10);
    expect(result.data.forwardEstimates.nextYearFreeCashFlowGrowth).toBeNull();
    expect(result.data.epsRevisions[0]).toEqual(expect.objectContaining({
      period: "current_year",
      upLastWeek: 3,
      downLastWeek: 1,
      netLastWeek: 2,
      netLastMonth: 6,
    }));
    expect(result.data.currency).toBe("USD");
    expect(result.data.coverage).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/earnings_estimate");
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("/revenue_estimate");
    expect(String(fetchMock.mock.calls[2]?.[0])).toContain("/eps_revisions");
    expect(String(fetchMock.mock.calls[0]?.[0])).not.toContain("secret-key".replace("secret-key", "not-a-real-marker"));
  });

  it("keeps EPS growth unavailable when the current-year EPS consensus is non-positive", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(json({ earnings_estimate: [
        { date: "2026-12-31", period: "current_year", avg_estimate: -0.5 },
        { date: "2027-12-31", period: "next_year", avg_estimate: 0.5 },
      ], status: "ok" }))
      .mockResolvedValueOnce(json({ revenue_estimate: [], status: "ok" }))
      .mockResolvedValueOnce(json({ eps_revision: [], status: "ok" }));
    const result = await fetchTwelveDataEstimateSnapshot(company, "key");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.forwardEstimates.nextYearEpsGrowth).toBeNull();
  });

  it("returns partial usable data when one estimate endpoint is plan-blocked", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(json({ earnings_estimate: [
        { date: "2026-12-31", period: "current_year", avg_estimate: 5 },
        { date: "2027-12-31", period: "next_year", avg_estimate: 6 },
      ], status: "ok" }))
      .mockResolvedValueOnce(json({ status: "error", code: 403, message: "Plan upgrade required" }))
      .mockResolvedValueOnce(json({ eps_revision: [
        { date: "2027-12-31", period: "next_year", up_last_week: 2, up_last_month: 4, down_last_week: 1, down_last_month: 1 },
      ], status: "ok" }));
    const result = await fetchTwelveDataEstimateSnapshot(company, "key");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.diagnostic.status).toBe("partial");
    expect(result.data.coverage).toBeCloseTo(2 / 3, 10);
    expect(result.data.forwardEstimates.nextYearEpsGrowth).toBeCloseTo(0.2, 10);
    expect(result.data.forwardEstimates.nextYearRevenueGrowth).toBeNull();
    expect(result.data.epsRevisions).toHaveLength(1);
  });

  it("drops malformed revision counts instead of inventing revision direction", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(json({ earnings_estimate: [], status: "ok" }))
      .mockResolvedValueOnce(json({ revenue_estimate: [{ date: "2026-12-31", period: "next_year", avg_estimate: 10 }], status: "ok" }))
      .mockResolvedValueOnce(json({ eps_revision: [
        { date: "2026-12-31", period: "next_year", up_last_week: -1, up_last_month: 2, down_last_week: 0, down_last_month: 0 },
      ], status: "ok" }));
    const result = await fetchTwelveDataEstimateSnapshot(company, "key");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.epsRevisions).toEqual([]);
  });

  it("stays unavailable when no API key is configured", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const result = await fetchTwelveDataEstimateSnapshot(company, "");
    expect(result).toEqual(expect.objectContaining({ ok: false, reason: "not_configured" }));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
