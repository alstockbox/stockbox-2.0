import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("batch ambiguous status contract", () => {
  it("keeps backend, client and localized copy aligned", () => {
    const root = process.cwd();
    const client = readFileSync(resolve(root, "src/components/batch/batch-workbench.tsx"), "utf8");
    const resolver = readFileSync(resolve(root, "src/app/api/batch/resolve/route.ts"), "utf8");
    const copy = readFileSync(resolve(root, "src/lib/i18n/p0-copy.ts"), "utf8");

    expect(resolver).toContain('resolution.reason === "ambiguous" ? "ambiguous" as const');
    expect(client).toContain('| "ambiguous"');
    expect(client).toContain('ambiguous: copy.statusAmbiguous');
    expect(copy).toContain('statusAmbiguous: "Ambiguous"');
    expect(copy).toContain('statusAmbiguous: "Tvetydig"');
  });
});
