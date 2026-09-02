import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("SEO unit-test CI coverage", () => {
  it("runs colocated SEO library tests as part of the full Vitest suite", () => {
    const config = read("vitest.config.ts");
    expect(config).toContain('"src/lib/seo/**/*.test.ts"');
  });
});
