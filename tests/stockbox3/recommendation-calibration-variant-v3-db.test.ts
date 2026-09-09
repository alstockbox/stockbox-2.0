import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260909115500_recommendation_v3_calibration_variant_binding.sql"),
  "utf8",
);

describe("Recommendation calibration variant V3 database binding", () => {
  it("stores one immutable reproducibility manifest without activating it", () => {
    expect(migration).toContain("variant_fingerprint text");
    expect(migration).toContain("variant_spec jsonb");
    expect(migration).toContain("variant_registered_at timestamptz");
    expect(migration).toContain("CALIBRATION_VARIANT_IMMUTABLE");
    expect(migration).toContain("v_candidate.stage <> 'CANDIDATE'");
    expect(migration).not.toContain("production_at = p_registered_at");
  });

  it("requires all new evidence to match the exact registered variant", () => {
    expect(migration).toContain("CALIBRATION_VARIANT_NOT_REGISTERED");
    expect(migration).toContain("new.variant_fingerprint <> v_candidate.variant_fingerprint");
    expect(migration).toContain("CALIBRATION_EVIDENCE_VARIANT_MISMATCH");
  });

  it("blocks stage advancement with legacy or mismatched evidence", () => {
    expect(migration).toContain("CALIBRATION_BACKTEST_VARIANT_MISMATCH");
    expect(migration).toContain("CALIBRATION_SHADOW_VARIANT_MISMATCH");
    expect(migration).toContain("e.variant_fingerprint = new.variant_fingerprint");
    expect(migration).toContain("check (stage = 'CANDIDATE' or variant_fingerprint is not null) not valid");
  });

  it("keeps registration service-role-only", () => {
    expect(migration).toContain("from authenticated");
    expect(migration).toContain("grant execute on function public.register_recommendation_v3_calibration_variant");
    expect(migration).not.toContain("grant execute on function public.register_recommendation_v3_calibration_variant(text, text, jsonb, timestamptz) to authenticated");
  });
});
