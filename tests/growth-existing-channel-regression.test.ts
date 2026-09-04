import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const engineSource = readFileSync("supabase/functions/stockbox-growth-engine/index.ts", "utf8");

describe("existing growth channel regression contract", () => {
  it.each(["seo", "creators", "metrics", "optimize", "brief", "full"])("keeps %s run mode", (mode) => {
    expect(engineSource).toContain(`mode === "${mode}"`);
  });

  it("keeps the existing v2 repurpose path during v3 rollout", () => {
    expect(engineSource).toContain('mode === "repurpose"');
    expect(engineSource).toContain("await repurpose(cfg)");
    expect(engineSource).toContain("acq_distribution_queue");
  });

  it("does not replace SEO or creators with the v3 media materializer", () => {
    expect(engineSource).toContain("await seo()");
    expect(engineSource).toContain("await creators(cfg)");
  });
});
