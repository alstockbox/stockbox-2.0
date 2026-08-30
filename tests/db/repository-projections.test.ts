import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "../..");
const source = readFileSync(join(root, "src/lib/db/repositories.ts"), "utf8");

describe("repository query projections", () => {
  it("never uses raw select-star queries", () => {
    expect(source).not.toMatch(/\.select\(\s*["']\*["']\s*\)/);
  });

  it("only selects the report field when loading a single analysis", () => {
    expect(source).toContain('.from("analyses").select("report")');
  });
});
