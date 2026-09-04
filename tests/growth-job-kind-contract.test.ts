import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GROWTH_RENDER_JOB_KINDS, assertGrowthRenderJobKind } from "@/lib/growth/render-job-kind";

const workerSource = readFileSync("scripts/growth/run-render-worker.mjs", "utf8");
const migrationSource = readFileSync("supabase/migrations/20260904173000_growth_render_job_kinds_v3.sql", "utf8");

describe("growth render job kind contract", () => {
  it("contains exactly the three approved render job kinds", () => {
    expect(GROWTH_RENDER_JOB_KINDS).toEqual(["video", "carousel", "static_image"]);
  });

  it.each(GROWTH_RENDER_JOB_KINDS)("accepts %s in the typed contract", (kind) => {
    expect(assertGrowthRenderJobKind(kind)).toBe(kind);
    expect(workerSource).toContain(`\"${kind}\"`);
    expect(migrationSource).toContain(`'${kind}'`);
  });

  it("rejects unknown kinds before rendering", () => {
    expect(() => assertGrowthRenderJobKind("audio_only")).toThrow(/unsupported_growth_render_job_kind/);
    expect(workerSource).toContain("unsupported_growth_render_job_kind");
  });

  it("dispatches every approved kind through an explicit handler", () => {
    expect(workerSource).toContain('jobKind === "video"');
    expect(workerSource).toContain('jobKind === "carousel"');
    expect(workerSource).toContain("renderStaticImage(job, workdir)");
  });
});
