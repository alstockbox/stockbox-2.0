export type StockBoxAiTask =
  | "decision_summary"
  | "news_impact"
  | "portfolio_coach"
  | "comparison"
  | "deep_report_summary";

export type StockBoxAiEvidence = {
  id: string;
  text: string;
  sourceUrl?: string | null;
  asOf?: string | null;
};

export type StockBoxAiRequest = {
  task: StockBoxAiTask;
  locale: "sv" | "en";
  evidence: StockBoxAiEvidence[];
  context?: Record<string, unknown>;
};

export type StockBoxDecisionSummary = {
  summary: string;
  why: string[];
  whyNot: string[];
  bullCase: string;
  baseCase: string;
  bearCase: string;
  evidenceIds: string[];
};

export type StockBoxAiProvider = {
  name: string;
  supports(request: StockBoxAiRequest): boolean;
  generate(request: StockBoxAiRequest): Promise<unknown>;
};

export type StockBoxAiSuccess<T> = {
  ok: true;
  provider: string;
  data: T;
  attemptedProviders: string[];
};

export type StockBoxAiFailure = {
  ok: false;
  reason: "no_provider_available" | "all_providers_failed_validation";
  attemptedProviders: string[];
  errors: string[];
};

export type StockBoxAiResult<T> = StockBoxAiSuccess<T> | StockBoxAiFailure;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function validateEvidenceReferences(
  evidenceIds: string[],
  evidence: StockBoxAiEvidence[],
): boolean {
  const allowed = new Set(evidence.map((item) => item.id));
  return evidenceIds.length > 0
    && evidenceIds.every((id) => allowed.has(id));
}

export function parseDecisionSummary(
  value: unknown,
  evidence: StockBoxAiEvidence[],
): StockBoxDecisionSummary | null {
  if (!isRecord(value)) return null;
  if (!nonEmptyString(value.summary)) return null;
  if (!isStringArray(value.why) || !isStringArray(value.whyNot)) return null;
  if (!nonEmptyString(value.bullCase) || !nonEmptyString(value.baseCase) || !nonEmptyString(value.bearCase)) return null;
  if (!isStringArray(value.evidenceIds) || !validateEvidenceReferences(value.evidenceIds, evidence)) return null;

  return {
    summary: value.summary.trim(),
    why: value.why.map((item) => item.trim()).filter(Boolean),
    whyNot: value.whyNot.map((item) => item.trim()).filter(Boolean),
    bullCase: value.bullCase.trim(),
    baseCase: value.baseCase.trim(),
    bearCase: value.bearCase.trim(),
    evidenceIds: [...new Set(value.evidenceIds)],
  };
}

export function createStockBoxAiGateway(providers: StockBoxAiProvider[]) {
  const configuredProviders = [...providers];

  async function generateDecisionSummary(
    request: StockBoxAiRequest,
  ): Promise<StockBoxAiResult<StockBoxDecisionSummary>> {
    if (request.task !== "decision_summary") {
      return {
        ok: false,
        reason: "no_provider_available",
        attemptedProviders: [],
        errors: ["generateDecisionSummary only accepts decision_summary tasks."],
      };
    }

    const eligible = configuredProviders.filter((provider) => provider.supports(request));
    if (!eligible.length) {
      return {
        ok: false,
        reason: "no_provider_available",
        attemptedProviders: [],
        errors: ["No configured AI provider supports this request."],
      };
    }

    const attemptedProviders: string[] = [];
    const errors: string[] = [];

    for (const provider of eligible) {
      attemptedProviders.push(provider.name);
      try {
        const response = await provider.generate(request);
        const parsed = parseDecisionSummary(response, request.evidence);
        if (!parsed) {
          errors.push(`${provider.name}: response failed schema or evidence validation.`);
          continue;
        }
        return {
          ok: true,
          provider: provider.name,
          data: parsed,
          attemptedProviders,
        };
      } catch (error) {
        errors.push(`${provider.name}: ${error instanceof Error ? error.message : "provider request failed"}`);
      }
    }

    return {
      ok: false,
      reason: "all_providers_failed_validation",
      attemptedProviders,
      errors,
    };
  }

  return { generateDecisionSummary };
}
