import { describe, expect, it } from "vitest";
import { searchCompanies } from "../../src/lib/data/provider";
import { fetchYahooFundamentalsResult } from "../../src/lib/data/yahoo-fundamentals";

const liveDescribe = process.env.RUN_LIVE_COVERAGE === "1" ? describe : describe.skip;
const REIT_PROBE_TICKERS = ["ORC", "EQIX", "O", "PLD"] as const;
const STOCKBOX_CONTACT_USER_AGENT = "StockBox/1.0 https://www.getstockbox.app/contact";
const SEC_PROBE_TIMEOUT_MS = 12_000;

type SecAccessProbe = {
  identity: string;
  endpoint: string;
  host: string;
  status: number | null;
  ok: boolean;
  error: string | null;
};

function padCik(value: string): string {
  return value.replace(/\D/g, "").padStart(10, "0");
}

async function probeSecEndpoint(input: {
  identity: string;
  userAgent: string;
  endpoint: string;
  url: string;
  accept: string;
}): Promise<SecAccessProbe> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SEC_PROBE_TIMEOUT_MS);
  try {
    const response = await fetch(input.url, {
      headers: {
        "User-Agent": input.userAgent,
        Accept: input.accept,
        "Accept-Encoding": "gzip, deflate",
      },
      signal: controller.signal,
      cache: "no-store",
    });
    return {
      identity: input.identity,
      endpoint: input.endpoint,
      host: new URL(input.url).host,
      status: response.status,
      ok: response.ok,
      error: null,
    };
  } catch (error) {
    return {
      identity: input.identity,
      endpoint: input.endpoint,
      host: new URL(input.url).host,
      status: null,
      ok: false,
      error: error instanceof Error ? `${error.name}:${error.message}` : "unknown_error",
    };
  } finally {
    clearTimeout(timeout);
  }
}

liveDescribe("live REIT specialized enrichment diagnostic", () => {
  it("traces exact-listing identity, nested specialist diagnostics, and raw SEC access without aborting on provider failures", async () => {
    const rows = [] as Array<Record<string, unknown>>;
    const resolvedCiks = new Map<string, string>();

    for (const ticker of REIT_PROBE_TICKERS) {
      const candidates = await searchCompanies(ticker);
      const company = candidates.find((candidate) =>
        (candidate.canonicalTicker ?? candidate.ticker).toUpperCase() === ticker
      );

      expect(company, `Expected an exact live search candidate for ${ticker}`).toBeTruthy();
      if (!company) continue;
      if (company.cik) resolvedCiks.set(ticker, company.cik);

      const result = await fetchYahooFundamentalsResult(company);
      rows.push({
        ticker,
        resolvedTicker: company.canonicalTicker ?? company.ticker,
        cik: company.cik ?? null,
        entityId: company.entityId ?? null,
        searchProviderIds: company.providerCapabilities?.providerIds ?? [],
        searchArchetypeHint: company.securityType ?? null,
        fundamentalsOk: result.ok,
        fundamentalsArchetype: result.ok ? result.data.analysisArchetype ?? null : null,
        specialistKind: result.ok ? result.data.specialized?.kind ?? null : null,
        specialistDiagnostics: result.ok
          ? (result.data.diagnostics?.providerDiagnostics ?? []).filter((item) => item.capability === "specialized")
          : [],
        topLevelDiagnostic: result.diagnostic,
        failureReason: result.ok ? null : result.reason,
      });
    }

    console.log(`REIT_SPECIALIZED_DIAGNOSTIC ${JSON.stringify(rows)}`);

    const configuredUserAgent = process.env.SEC_USER_AGENT?.trim() ?? "";
    const identities = [
      ...(configuredUserAgent ? [{ label: "configured", value: configuredUserAgent }] : []),
      { label: "stockbox_contact_url", value: STOCKBOX_CONTACT_USER_AGENT },
    ];
    const representativeCik = resolvedCiks.get("O") ?? resolvedCiks.get("PLD") ?? null;
    const endpoints = [
      {
        label: "ticker_universe",
        url: "https://www.sec.gov/files/company_tickers.json",
        accept: "application/json",
      },
      ...(representativeCik
        ? [{
            label: "submissions",
            url: `https://data.sec.gov/submissions/CIK${padCik(representativeCik)}.json`,
            accept: "application/json",
          }]
        : []),
    ];

    const secAccessRows: SecAccessProbe[] = [];
    for (const identity of identities) {
      for (const endpoint of endpoints) {
        secAccessRows.push(await probeSecEndpoint({
          identity: identity.label,
          userAgent: identity.value,
          endpoint: endpoint.label,
          url: endpoint.url,
          accept: endpoint.accept,
        }));
      }
    }

    console.log(`SEC_ACCESS_DIAGNOSTIC ${JSON.stringify(secAccessRows)}`);
    expect(rows).toHaveLength(REIT_PROBE_TICKERS.length);
    expect(secAccessRows.length).toBeGreaterThanOrEqual(identities.length);
  }, 180_000);
});
