export type GrowthDiagnosticState = "healthy" | "degraded_recovered" | "action_required";

export type GrowthRunLike = {
  workflow?: string | null;
  status?: string | null;
  detail?: Record<string, unknown> | null;
};

export type GrowthErrorLike = {
  source?: string | null;
  error_type?: string | null;
  message?: string | null;
};

export type GrowthDiagnosticResult = {
  state: GrowthDiagnosticState;
  founderMessage: string;
  technicalSummary: string;
};

function count(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function hasRecoveredFallback(run: GrowthRunLike) {
  const detail = run.detail ?? {};
  return (
    count(detail.deterministic) > 0 ||
    count(detail.deterministic_fallback) > 0 ||
    count(detail.fallback) > 0 ||
    detail.rss_circuit_open === true ||
    detail.provider_fallback === true
  );
}

function hasFatalOperationalError(errors: GrowthErrorLike[]) {
  return errors.some((error) => {
    const type = String(error.error_type || "").toLowerCase();
    const source = String(error.source || "").toLowerCase();
    return (
      type.includes("render_failed") ||
      type.includes("storage_failed") ||
      type.includes("qc_failed") ||
      type.includes("asset_missing") ||
      source.includes("render-worker") && type.includes("failed")
    );
  });
}

export function classifyGrowthRun(input: {
  run: GrowthRunLike;
  relatedErrors: GrowthErrorLike[];
}): GrowthDiagnosticResult {
  const status = String(input.run.status || "").toLowerCase();
  const workflow = String(input.run.workflow || "growth-workflow");
  const errors = input.relatedErrors ?? [];

  if (status !== "success" || hasFatalOperationalError(errors)) {
    return {
      state: "action_required",
      founderMessage: "Ett growth-steg behöver åtgärdas innan materialet kan räknas som färdigt.",
      technicalSummary: `${workflow}: ${status || "unknown"}; errors=${errors.length}`,
    };
  }

  if (errors.length > 0 || hasRecoveredFallback(input.run)) {
    return {
      state: "degraded_recovered",
      founderMessage: "Motorn slutförde jobbet med fallback. Ingen manuell åtgärd krävs just nu.",
      technicalSummary: `${workflow}: recovered; errors=${errors.length}`,
    };
  }

  return {
    state: "healthy",
    founderMessage: "Motorn slutförde jobbet normalt.",
    technicalSummary: `${workflow}: success`,
  };
}
