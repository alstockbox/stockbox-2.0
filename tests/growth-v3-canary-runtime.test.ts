import { describe, expect, it } from "vitest";
import { GROWTH_V3_CANARY_VERSION, configBool, parseConfigRows } from "../supabase/functions/stockbox-growth-engine-v3/runtime";

describe("growth v3 canary runtime", () => {
  it("preserves null numeric cost config so unknown spend fails closed", () => {
    const cfg = parseConfigRows([
      { key: "growth_voice_estimated_sek_per_job", value: null, value_type: "number" },
      { key: "growth_v3_quality_floor", value: "72", value_type: "number" },
    ]);
    expect(cfg.growth_voice_estimated_sek_per_job).toBeNull();
    expect(cfg.growth_v3_quality_floor).toBe(72);
  });

  it("parses boolean config deterministically", () => {
    const cfg = parseConfigRows([
      { key: "growth_render_shadow_mode", value: "true", value_type: "boolean" },
      { key: "growth_english_voice_enabled", value: "false", value_type: "boolean" },
    ]);
    expect(cfg.growth_render_shadow_mode).toBe(true);
    expect(cfg.growth_english_voice_enabled).toBe(false);
    expect(configBool(cfg.growth_render_shadow_mode)).toBe(true);
  });

  it("has an explicit shadow-canary version identifier", () => {
    expect(GROWTH_V3_CANARY_VERSION).toBe("growth-v3-shadow-canary");
  });
});
