import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env/server", () => ({ getSecUserAgent: vi.fn(() => "StockBox tests test@example.com") }));

import { classifySecEvent, fetchSecSubmissionEvents, parseSecSubmissionEvents } from "../../src/lib/data/sec-submissions";

const payload = {
  cik: "19617",
  filings: {
    recent: {
      accessionNumber: ["0000019617-26-000001", "0000019617-26-000002", "0000019617-26-000003", "0000019617-26-000004", "0000019617-26-000005"],
      filingDate: ["2026-08-20", "2026-08-15", "2026-08-10", "2026-08-05", "2026-08-01"],
      form: ["8-K", "8-K", "8-K", "10-Q", "6-K"],
      primaryDocument: ["earnings.htm", "acquisition.htm", "other.htm", "quarterly.htm", "foreign.htm"],
      items: ["2.02,9.01", "2.01", "8.01", "", ""],
    },
  },
};

describe("SEC submissions research", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("classifies only evidence-supported filing event categories", () => {
    expect(classifySecEvent("8-K", ["2.02"])).toBe("earnings_results");
    expect(classifySecEvent("8-K", ["2.01"])).toBe("acquisition_disposition");
    expect(classifySecEvent("8-K", ["5.02"])).toBe("management_governance");
    expect(classifySecEvent("8-K", ["8.01"])).toBe("other_material_event");
    expect(classifySecEvent("6-K", [])).toBe("other_material_event");
  });

  it("preserves form, date, accession, items and primary-document provenance", () => {
    const events = parseSecSubmissionEvents(payload, "0000019617");
    expect(events).toHaveLength(5);
    expect(events[0]).toEqual(expect.objectContaining({
      category: "earnings_results",
      form: "8-K",
      filingDate: "2026-08-20",
      accession: "0000019617-26-000001",
      primaryDocument: "earnings.htm",
      items: ["2.02", "9.01"],
      provider: "sec-submissions",
    }));
    expect(events[0]?.url).toBe("https://www.sec.gov/Archives/edgar/data/19617/000001961726000001/earnings.htm");
    expect(events.map((event) => event.category)).not.toContain("guidance");
  });

  it("retries a transient SEC failure and returns auditable evidence", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("busy", { status: 503 }))
      .mockResolvedValueOnce(Response.json(payload));

    const result = await fetchSecSubmissionEvents({ ticker: "JPM", name: "JPMorgan Chase", cik: "0000019617" });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.data).toHaveLength(5);
      expect(result.data.evidence[0]).toEqual(expect.objectContaining({ sourceTier: "regulatory_filing" }));
    }
  });
});
