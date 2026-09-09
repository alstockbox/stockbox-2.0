import { createHash } from "node:crypto";
import type { RecommendationCalibrationCandidateV3 } from "@/lib/analysis/recommendation-learning-v3";
import { recommendationCalibrationCandidateKeyV3 } from "@/lib/db/recommendation-calibration-v3";
import { createAdminClient } from "@/lib/supabase/admin";

export const RECOMMENDATION_CALIBRATION_VARIANT_SCHEMA_V3 =
  "stockbox-recommendation-calibration-variant-v3.0.0" as const;

export type RecommendationCalibrationVariantScalarV3 = string | number | boolean | null;

export type RecommendationCalibrationVariantChangeV3 = {
  path: string;
  before: RecommendationCalibrationVariantScalarV3;
  after: RecommendationCalibrationVariantScalarV3;
  rationale: string;
};

export type RecommendationCalibrationVariantSpecV3 = {
  schemaVersion: typeof RECOMMENDATION_CALIBRATION_VARIANT_SCHEMA_V3;
  baseModelVersion: string;
  baseRecommendationPolicyVersion: string;
  variantModelVersion: string;
  variantRecommendationPolicyVersion: string;
  implementationRef: string;
  changes: RecommendationCalibrationVariantChangeV3[];
};

export type RegisteredRecommendationCalibrationVariantV3 = {
  spec: RecommendationCalibrationVariantSpecV3;
  fingerprint: string;
};

function clean(value: string, code: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(code);
  return normalized;
}

function scalar(value: RecommendationCalibrationVariantScalarV3): RecommendationCalibrationVariantScalarV3 {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("CALIBRATION_VARIANT_NONFINITE_VALUE");
    return Object.is(value, -0) ? 0 : value;
  }
  return value;
}

function normalizeVariantSpecV3(
  candidate: RecommendationCalibrationCandidateV3,
  spec: RecommendationCalibrationVariantSpecV3,
): RecommendationCalibrationVariantSpecV3 {
  if (spec.schemaVersion !== RECOMMENDATION_CALIBRATION_VARIANT_SCHEMA_V3) {
    throw new Error("CALIBRATION_VARIANT_SCHEMA_UNSUPPORTED");
  }

  const baseModelVersion = clean(spec.baseModelVersion, "CALIBRATION_VARIANT_BASE_MODEL_REQUIRED");
  const baseRecommendationPolicyVersion = clean(
    spec.baseRecommendationPolicyVersion,
    "CALIBRATION_VARIANT_BASE_POLICY_REQUIRED",
  );
  if (
    baseModelVersion !== candidate.modelVersion.trim()
    || baseRecommendationPolicyVersion !== candidate.recommendationPolicyVersion.trim()
  ) {
    throw new Error("CALIBRATION_VARIANT_LINEAGE_MISMATCH");
  }

  const variantModelVersion = clean(spec.variantModelVersion, "CALIBRATION_VARIANT_MODEL_VERSION_REQUIRED");
  const variantRecommendationPolicyVersion = clean(
    spec.variantRecommendationPolicyVersion,
    "CALIBRATION_VARIANT_POLICY_VERSION_REQUIRED",
  );
  if (
    variantModelVersion === baseModelVersion
    && variantRecommendationPolicyVersion === baseRecommendationPolicyVersion
  ) {
    throw new Error("CALIBRATION_VARIANT_VERSION_BUMP_REQUIRED");
  }

  const implementationRef = clean(spec.implementationRef, "CALIBRATION_VARIANT_IMPLEMENTATION_REF_REQUIRED");
  if (implementationRef.length > 240) throw new Error("CALIBRATION_VARIANT_IMPLEMENTATION_REF_TOO_LONG");
  if (!Array.isArray(spec.changes) || spec.changes.length === 0) {
    throw new Error("CALIBRATION_VARIANT_CHANGE_REQUIRED");
  }

  const seen = new Set<string>();
  const changes = spec.changes.map((change) => {
    const path = clean(change.path, "CALIBRATION_VARIANT_CHANGE_PATH_REQUIRED");
    if (seen.has(path)) throw new Error("CALIBRATION_VARIANT_DUPLICATE_CHANGE_PATH");
    seen.add(path);
    const before = scalar(change.before);
    const after = scalar(change.after);
    if (Object.is(before, after)) throw new Error("CALIBRATION_VARIANT_NOOP_CHANGE");
    return {
      path,
      before,
      after,
      rationale: clean(change.rationale, "CALIBRATION_VARIANT_CHANGE_RATIONALE_REQUIRED"),
    };
  }).sort((left, right) => left.path.localeCompare(right.path));

  return {
    schemaVersion: RECOMMENDATION_CALIBRATION_VARIANT_SCHEMA_V3,
    baseModelVersion,
    baseRecommendationPolicyVersion,
    variantModelVersion,
    variantRecommendationPolicyVersion,
    implementationRef,
    changes,
  };
}

export function buildRecommendationCalibrationVariantV3(
  candidate: RecommendationCalibrationCandidateV3,
  spec: RecommendationCalibrationVariantSpecV3,
): RegisteredRecommendationCalibrationVariantV3 {
  const normalized = normalizeVariantSpecV3(candidate, spec);
  const fingerprint = createHash("sha256")
    .update(JSON.stringify(normalized), "utf8")
    .digest("hex");
  return { spec: normalized, fingerprint };
}

export type RecommendationCalibrationVariantPersistResultV3 =
  | { ok: true; configured: true; fingerprint: string; registered: boolean }
  | { ok: false; configured: false; error: "SUPABASE_ADMIN_NOT_CONFIGURED" }
  | { ok: false; configured: true; error: string };

/**
 * Registers one immutable variant for a drift candidate while it is still in
 * CANDIDATE. This does not activate, backtest or expose the variant to users.
 * The database binds all later evidence and stage transitions to this exact
 * fingerprint so a different implementation cannot reuse prior evidence.
 */
export async function registerRecommendationCalibrationVariantV3(input: {
  candidate: RecommendationCalibrationCandidateV3;
  spec: RecommendationCalibrationVariantSpecV3;
  registeredAt?: string;
}): Promise<RecommendationCalibrationVariantPersistResultV3> {
  if (input.candidate.stage !== "CANDIDATE") {
    return { ok: false, configured: true, error: "CALIBRATION_VARIANT_REGISTRATION_STAGE_INVALID" };
  }
  const variant = buildRecommendationCalibrationVariantV3(input.candidate, input.spec);
  const supabase = createAdminClient();
  if (!supabase) return { ok: false, configured: false, error: "SUPABASE_ADMIN_NOT_CONFIGURED" };

  try {
    const { data, error } = await supabase.rpc("register_recommendation_v3_calibration_variant", {
      p_candidate_key: recommendationCalibrationCandidateKeyV3(input.candidate),
      p_variant_fingerprint: variant.fingerprint,
      p_variant_spec: variant.spec,
      p_registered_at: input.registeredAt ?? new Date().toISOString(),
    });
    if (error) return { ok: false, configured: true, error: error.message };
    const returned = Array.isArray(data) ? data[0] : data;
    const persistedFingerprint = returned && typeof returned === "object" && "variant_fingerprint" in returned
      ? String(returned.variant_fingerprint ?? "")
      : variant.fingerprint;
    if (persistedFingerprint !== variant.fingerprint) {
      return { ok: false, configured: true, error: "CALIBRATION_VARIANT_FINGERPRINT_MISMATCH" };
    }
    return { ok: true, configured: true, fingerprint: variant.fingerprint, registered: true };
  } catch (error) {
    return {
      ok: false,
      configured: true,
      error: error instanceof Error ? error.message : "UNKNOWN_CALIBRATION_VARIANT_REGISTRATION_ERROR",
    };
  }
}
