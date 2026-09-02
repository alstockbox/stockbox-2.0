import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("immutable public sample cache", () => {
  it("caches the approved sample across requests instead of querying Supabase on every crawler render", () => {
    const loader = read("src/lib/analysis/public-sample.ts");
    expect(loader).toContain('import { unstable_cache } from "next/cache"');
    expect(loader).toContain("getPublicSampleAnalysisUncached");
    expect(loader).toContain('unstable_cache(getPublicSampleAnalysisUncached, ["public-sample-analysis"],');
    expect(loader).toContain("PUBLIC_SAMPLE_CACHE_SECONDS");
  });
});
