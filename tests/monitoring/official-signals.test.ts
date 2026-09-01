import { describe, expect, it } from "vitest";
import type { OfficialResearchBundle } from "../../src/lib/data/official-research";
import { deriveOfficialMonitoringSignals } from "../../src/lib/monitoring/official-signals";

function bundle(overrides: Partial<OfficialResearchBundle> = {}): OfficialResearchBundle {
  const source = {
    name: "Official source",
    url: "https://example.com",
    accessedAt: "2026-09-01T08:00:00.000Z",
    provider: "test",
    capability: "insider" as const,
  };
  return {
    company: {
      ticker: "TEST.ST",
      canonicalTicker: "TEST.ST",
      name: "Test AB",
      country: "SE",
      currency: "SEK",
    },
    organizationNumber: null,
    identity: { gleif: null, openFigi: null },
    macro: null,
    insider: {
      data: [{
        transactionType: "open_market_buy",
        insiderRole: "CEO",
        shares: 1000,
        value: 1_500_000,
        ownershipChange: null,
        date: "2026-08-31",
        automaticPlan: false,
      }],
      dataAsOf: "2026-08-31",
      coverage: 1,
      confidence: 95,
      evidence: [{ id: "insider-1", kind: "reported_fact", sourceTier: "official_regulator", title: "Insider", source, dataAsOf: "2026-08-31" }],
    },
    positioning: {
      data: { issuerName: "Test AB", lei: "549300TEST", positionDate: "2026-08-31", aggregateShortPercent: 5.25 },
      dataAsOf: "2026-08-31",
      coverage: 1,
      confidence: 95,
      evidence: [{ id: "short-1", kind: "reported_fact", sourceTier: "official_regulator", title: "Short", source: { ...source, capability: "positioning" as const }, dataAsOf: "2026-08-31" }],
    },
    bolagsverket: null,
    diagnostics: [],
    sources: [source],
    ...overrides,
  } as OfficialResearchBundle;
}

describe("official monitoring signals", () => {
  it("creates deterministic insider and short-interest states", () => {
    const first = deriveOfficialMonitoringSignals(bundle());
    const second = deriveOfficialMonitoringSignals(bundle());

    expect(first.map((signal) => signal.kind)).toEqual(["insider", "short_interest"]);
    expect(first.map((signal) => signal.hash)).toEqual(second.map((signal) => signal.hash));
    expect(first.find((signal) => signal.kind === "insider")?.severity).toBe("important");
    expect(first.find((signal) => signal.kind === "short_interest")?.severity).toBe("important");
  });

  it("changes the insider hash when a new transaction appears", () => {
    const original = deriveOfficialMonitoringSignals(bundle()).find((signal) => signal.kind === "insider");
    const changedBundle = bundle();
    changedBundle.insider!.data = [
      {
        transactionType: "open_market_sell",
        insiderRole: "Director",
        shares: 100,
        value: 50_000,
        ownershipChange: null,
        date: "2026-09-01",
        automaticPlan: false,
      },
      ...changedBundle.insider!.data,
    ];
    const changed = deriveOfficialMonitoringSignals(changedBundle).find((signal) => signal.kind === "insider");

    expect(changed?.hash).not.toBe(original?.hash);
  });

  it("preserves absence from FI short register as unknown state rather than zero", () => {
    const noShort = bundle({
      positioning: {
        data: null,
        dataAsOf: "2026-09-01",
        coverage: 0.7,
        confidence: 75,
        evidence: [],
      },
    });
    const signal = deriveOfficialMonitoringSignals(noShort).find((item) => item.kind === "short_interest");

    expect(signal).toBeDefined();
    expect(signal?.payload).toMatchObject({ status: "not_listed_in_current_register" });
    expect(signal?.body).toContain("must not be interpreted as 0%");
  });

  it("activates filing signals automatically once Bolagsverket data becomes available", () => {
    const withFiling = bundle({
      bolagsverket: {
        data: {
          organizationNumber: "5560000000",
          documents: [{ documentId: "doc-2025", fileFormat: "iXBRL", reportingPeriodEnd: "2025-12-31", registeredAt: "2026-03-01" }],
        },
        dataAsOf: "2025-12-31",
        coverage: 1,
        confidence: 98,
        evidence: [],
      },
    });

    expect(deriveOfficialMonitoringSignals(withFiling).some((signal) => signal.kind === "filing")).toBe(true);
  });
});
