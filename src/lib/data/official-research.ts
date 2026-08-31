import type { AnalysisSource, CompanySearchResult, InsiderTransaction, ProviderDiagnostic, ResearchLayerPayload } from "@/lib/analysis/types";
import { getSecUserAgent, getServerEnv } from "@/lib/env/server";
import { fetchBolagsverketAnnualReportEvidence, type BolagsverketFilingsData } from "./bolagsverket";
import { fetchFiInsiderTransactions, fetchFiShortPosition, type FiShortPosition } from "./fi-market-intelligence";
import { resolveGleifIdentity, normalizeSwedishOrganizationNumber, type GleifIdentity } from "./gleif";
import { resolveOpenFigiIdentity, type OpenFigiIdentity } from "./openfigi";
import { fetchRiksbankMacroContext, type RiksbankMacroData } from "./riksbank";
import { fetchSecInsiderTransactions } from "./sec-insider";

export type OfficialResearchBundle = {
  company: CompanySearchResult;
  organizationNumber: string | null;
  identity: { gleif: GleifIdentity | null; openFigi: OpenFigiIdentity | null };
  macro: ResearchLayerPayload<RiksbankMacroData> | null;
  insider: ResearchLayerPayload<InsiderTransaction[]> | null;
  positioning: ResearchLayerPayload<FiShortPosition | null> | null;
  bolagsverket: ResearchLayerPayload<BolagsverketFilingsData> | null;
  diagnostics: ProviderDiagnostic[];
  sources: AnalysisSource[];
};

function isSwedish(company: CompanySearchResult): boolean {
  const country = (company.country ?? "").trim().toUpperCase();
  return ["SE", "SWEDEN", "SVERIGE"].includes(country) || /\.ST$/i.test(company.canonicalTicker ?? company.ticker);
}

function sourceFromEvidence(payload: { evidence: Array<{ source: AnalysisSource }> } | null): AnalysisSource[] {
  return payload?.evidence.map((item) => item.source) ?? [];
}

function uniqueSources(sources: AnalysisSource[]): AnalysisSource[] {
  const seen = new Set<string>();
  return sources.filter((source) => {
    const key = `${source.provider ?? source.name}|${source.url}|${source.dataAsOf ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function fetchOfficialResearchBundle(
  company: CompanySearchResult,
  options: { deepResearch: boolean; fetcher?: typeof fetch } = { deepResearch: false },
): Promise<OfficialResearchBundle> {
  const env = getServerEnv();
  const fetcher = options.fetcher;
  const macroPromise = fetchRiksbankMacroContext(company, { apiKey: env.RIKSBANK_API_KEY, fetcher });
  if (!options.deepResearch) {
    const macroResult = await macroPromise;
    return {
      company,
      organizationNumber: null,
      identity: { gleif: null, openFigi: null },
      macro: macroResult.ok ? macroResult.data : null,
      insider: null,
      positioning: null,
      bolagsverket: null,
      diagnostics: [macroResult.diagnostic],
      sources: macroResult.ok ? sourceFromEvidence(macroResult.data) : [],
    };
  }

  const [macroResult, gleifResult, openFigiResult] = await Promise.all([
    macroPromise,
    resolveGleifIdentity(company, { fetcher }),
    resolveOpenFigiIdentity(company, { apiKey: env.OPENFIGI_API_KEY, fetcher }),
  ]);
  const gleif = gleifResult.ok ? gleifResult.data : null;
  const openFigi = openFigiResult.ok ? openFigiResult.data : null;
  const enrichedCompany: CompanySearchResult = {
    ...company,
    lei: company.lei ?? gleif?.lei,
    figi: company.figi ?? openFigi?.figi,
  };
  const organizationNumber = normalizeSwedishOrganizationNumber(gleif?.registrationAuthorityEntityId ?? gleif?.registeredAs);
  const swedish = isSwedish(enrichedCompany);

  const insiderPromise = swedish
    ? fetchFiInsiderTransactions(enrichedCompany, { fetcher })
    : enrichedCompany.cik
      ? fetchSecInsiderTransactions(enrichedCompany, { userAgent: getSecUserAgent(env), fetcher })
      : Promise.resolve(null);
  const positioningPromise = swedish
    ? fetchFiShortPosition(enrichedCompany, { lei: enrichedCompany.lei }, { fetcher })
    : Promise.resolve(null);
  const bolagsverketCredentials = env.BOLAGSVERKET_CLIENT_ID
    && env.BOLAGSVERKET_CLIENT_SECRET
    && env.BOLAGSVERKET_TOKEN_URL
    && env.BOLAGSVERKET_BASE_URL
    ? {
      clientId: env.BOLAGSVERKET_CLIENT_ID,
      clientSecret: env.BOLAGSVERKET_CLIENT_SECRET,
      tokenUrl: env.BOLAGSVERKET_TOKEN_URL,
      baseUrl: env.BOLAGSVERKET_BASE_URL,
      scope: env.BOLAGSVERKET_SCOPE,
    }
    : null;
  const bolagsverketPromise = swedish
    ? fetchBolagsverketAnnualReportEvidence(organizationNumber, bolagsverketCredentials, { fetcher })
    : Promise.resolve(null);

  const [insiderResult, positioningResult, bolagsverketResult] = await Promise.all([
    insiderPromise,
    positioningPromise,
    bolagsverketPromise,
  ]);

  const diagnostics: ProviderDiagnostic[] = [macroResult.diagnostic, gleifResult.diagnostic, openFigiResult.diagnostic];
  if (insiderResult) diagnostics.push(insiderResult.diagnostic);
  if (positioningResult) diagnostics.push(positioningResult.diagnostic);
  if (bolagsverketResult) diagnostics.push(bolagsverketResult.diagnostic);

  const insider = insiderResult?.ok ? insiderResult.data : null;
  const positioning = positioningResult?.ok ? positioningResult.data : null;
  const bolagsverket = bolagsverketResult?.ok ? bolagsverketResult.data : null;
  const sources = uniqueSources([
    ...(gleif ? [gleif.source] : []),
    ...(openFigi ? [openFigi.source] : []),
    ...(macroResult.ok ? sourceFromEvidence(macroResult.data) : []),
    ...sourceFromEvidence(insider),
    ...sourceFromEvidence(positioning),
    ...sourceFromEvidence(bolagsverket),
  ]);

  return {
    company: enrichedCompany,
    organizationNumber,
    identity: { gleif, openFigi },
    macro: macroResult.ok ? macroResult.data : null,
    insider,
    positioning,
    bolagsverket,
    diagnostics,
    sources,
  };
}
