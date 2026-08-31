import type { CompanySearchResult, InsiderTransaction, ResearchEvidence, ResearchLayerPayload } from "@/lib/analysis/types";
import { providerDiagnostic, type AdapterResult } from "./providers";

function tagValue(xml: string, tag: string): string | null {
  const match = xml.match(new RegExp(`<${tag}\\b[^>]*>(?:\\s*<value\\b[^>]*>)?([\\s\\S]*?)(?:<\\/value>\\s*)?<\\/${tag}>`, "i"));
  if (!match) return null;
  return match[1].replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim() || null;
}

function numeric(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value.replace(/[$,\s]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function relationshipRole(xml: string): string | null {
  const title = tagValue(xml, "officerTitle");
  if (title) return title;
  if (tagValue(xml, "isDirector") === "1") return "Director";
  if (tagValue(xml, "isTenPercentOwner") === "1") return "10% Owner";
  if (tagValue(xml, "isOfficer") === "1") return "Officer";
  if (tagValue(xml, "isOther") === "1") return "Other insider";
  return null;
}

function transactionType(code: string | null, acquiredDisposed: string | null, automaticPlan: boolean): InsiderTransaction["transactionType"] {
  const normalized = (code ?? "").trim().toUpperCase();
  if (automaticPlan && normalized === "S") return "automatic_plan";
  if (normalized === "P" || (normalized === "A" && acquiredDisposed === "A")) return normalized === "P" ? "open_market_buy" : "other";
  if (normalized === "S") return "open_market_sell";
  if (normalized === "M") return "option_exercise";
  if (normalized === "F") return "tax_related";
  return "other";
}

export function parseSecOwnershipXml(xml: string): InsiderTransaction[] {
  if (!/<ownershipDocument\b/i.test(xml)) return [];
  const ownerBlock = xml.match(/<reportingOwner\b[^>]*>([\s\S]*?)<\/reportingOwner>/i)?.[1] ?? xml;
  const role = relationshipRole(ownerBlock);
  const automaticPlan = tagValue(xml, "aff10b5One") === "1" || /10b5-1/i.test(xml);
  const blocks = [...xml.matchAll(/<nonDerivativeTransaction\b[^>]*>([\s\S]*?)<\/nonDerivativeTransaction>/gi)];
  return blocks.flatMap((match) => {
    const block = match[1];
    const date = tagValue(block, "transactionDate");
    const code = tagValue(block, "transactionCode");
    const shares = numeric(tagValue(block, "transactionShares"));
    const price = numeric(tagValue(block, "transactionPricePerShare"));
    const acquiredDisposed = tagValue(block, "transactionAcquiredDisposedCode")?.toUpperCase() ?? null;
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return [];
    const type = transactionType(code, acquiredDisposed, automaticPlan);
    return [{
      transactionType: type,
      insiderRole: role,
      shares,
      value: shares !== null && price !== null ? Math.abs(shares * price) : null,
      ownershipChange: null,
      date,
      automaticPlan: type === "automatic_plan",
    } satisfies InsiderTransaction];
  });
}

type SecRecentFilings = {
  accessionNumber?: string[];
  filingDate?: string[];
  form?: string[];
  primaryDocument?: string[];
};

function recentForm4Filings(payload: unknown): Array<{ accession: string; filingDate: string; primaryDocument: string }> {
  if (!payload || typeof payload !== "object") return [];
  const recent = ((payload as Record<string, unknown>).filings as Record<string, unknown> | undefined)?.recent as SecRecentFilings | undefined;
  if (!recent?.form || !recent.accessionNumber || !recent.filingDate || !recent.primaryDocument) return [];
  const result: Array<{ accession: string; filingDate: string; primaryDocument: string }> = [];
  for (let index = 0; index < recent.form.length; index += 1) {
    if (!/^4(?:\/A)?$/i.test(recent.form[index] ?? "")) continue;
    const accession = recent.accessionNumber[index];
    const filingDate = recent.filingDate[index];
    const primaryDocument = recent.primaryDocument[index];
    if (accession && filingDate && primaryDocument) result.push({ accession, filingDate, primaryDocument });
    if (result.length >= 12) break;
  }
  return result;
}

function archiveDocumentUrl(cik: string, accession: string, primaryDocument: string, preferXml: boolean): string {
  const cikNumber = cik.replace(/\D/g, "").replace(/^0+/, "") || "0";
  const accessionCompact = accession.replace(/-/g, "");
  let document = primaryDocument.replace(/^\/+/, "");
  if (preferXml && /\.html?$/i.test(document)) document = document.replace(/\.html?$/i, ".xml");
  return `https://www.sec.gov/Archives/edgar/data/${cikNumber}/${accessionCompact}/${document}`;
}

async function fetchOwnershipDocument(
  filing: { accession: string; filingDate: string; primaryDocument: string },
  cik: string,
  userAgent: string,
  fetcher: typeof fetch,
): Promise<{ text: string; url: string } | null> {
  for (const preferXml of [true, false]) {
    const url = archiveDocumentUrl(cik, filing.accession, filing.primaryDocument, preferXml);
    try {
      const response = await fetcher(url, { headers: { Accept: "application/xml,text/xml,text/html", "User-Agent": userAgent }, signal: AbortSignal.timeout(8_000) });
      if (!response.ok) continue;
      const text = await response.text();
      if (/<ownershipDocument\b/i.test(text)) return { text, url };
    } catch {
      // Try the alternate primary-document representation before failing this filing.
    }
  }
  return null;
}

export async function fetchSecInsiderTransactions(
  company: Pick<CompanySearchResult, "cik" | "ticker" | "canonicalTicker">,
  options: { userAgent: string | null; fetcher?: typeof fetch },
): Promise<AdapterResult<ResearchLayerPayload<InsiderTransaction[]>>> {
  if (!company.cik) return { ok: false, reason: "unsupported_symbol", message: "SEC Form 4 requires an issuer CIK.", diagnostic: providerDiagnostic("sec-form4", "insider", "unsupported", "missing_cik") };
  if (!options.userAgent?.trim()) return { ok: false, reason: "not_configured", message: "SEC access requires a configured StockBox user agent.", diagnostic: providerDiagnostic("sec-form4", "insider", "unavailable", "missing_user_agent") };
  const cik = company.cik.replace(/\D/g, "").padStart(10, "0");
  const submissionsUrl = `https://data.sec.gov/submissions/CIK${cik}.json`;
  const fetcher = options.fetcher ?? fetch;
  try {
    const submissionsResponse = await fetcher(submissionsUrl, { headers: { Accept: "application/json", "User-Agent": options.userAgent.trim() }, signal: AbortSignal.timeout(8_000) });
    if (submissionsResponse.status === 429) return { ok: false, reason: "rate_limited", message: "SEC fair-access limit reached.", diagnostic: providerDiagnostic("sec-form4", "insider", "unavailable", "rate_limited") };
    if (!submissionsResponse.ok) return { ok: false, reason: "upstream_error", message: `SEC submissions returned HTTP ${submissionsResponse.status}.`, diagnostic: providerDiagnostic("sec-form4", "insider", "unavailable", `http_${submissionsResponse.status}`) };
    const filings = recentForm4Filings(await submissionsResponse.json());
    const transactions: InsiderTransaction[] = [];
    const evidence: ResearchEvidence[] = [];
    for (const filing of filings) {
      const document = await fetchOwnershipDocument(filing, cik, options.userAgent.trim(), fetcher);
      if (!document) continue;
      const parsed = parseSecOwnershipXml(document.text);
      if (!parsed.length) continue;
      const source = {
        name: `SEC Form 4 ${filing.accession}`,
        url: document.url,
        accessedAt: new Date().toISOString(),
        freshness: "Official SEC beneficial-ownership filing.",
        provider: "sec-form4",
        capability: "insider" as const,
        dataAsOf: filing.filingDate,
        version: "sec-form4-adapter-v1",
      };
      const itemEvidence: ResearchEvidence = { id: `sec-form4-${filing.accession}`, kind: "reported_fact", sourceTier: "regulatory_filing", title: `SEC Form 4 filed ${filing.filingDate}`, source, dataAsOf: filing.filingDate };
      evidence.push(itemEvidence);
      transactions.push(...parsed.map((transaction) => ({ ...transaction, evidence: itemEvidence })));
    }
    transactions.sort((left, right) => right.date.localeCompare(left.date));
    const dataAsOf = transactions[0]?.date ?? filings[0]?.filingDate ?? null;
    return {
      ok: true,
      data: { data: transactions, dataAsOf, coverage: filings.length ? Math.min(1, evidence.length / filings.length) : 0.5, confidence: evidence.length ? 95 : 70, evidence },
      diagnostic: providerDiagnostic("sec-form4", "insider", evidence.length ? "available" : "partial", evidence.length ? undefined : "no_parseable_recent_form4"),
    };
  } catch (error) {
    const reason = error instanceof Error && error.name === "TimeoutError" ? "timeout" : "upstream_error";
    return { ok: false, reason, message: "SEC Form 4 research request failed.", diagnostic: providerDiagnostic("sec-form4", "insider", "unavailable", reason) };
  }
}
