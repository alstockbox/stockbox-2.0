import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (file: string) => readFileSync(join(root, file), "utf8");

describe("StockBox positioning copy", () => {
  it("uses data-driven positioning while preserving source transparency", () => {
    const marketing = read("src/lib/i18n/marketing-copy.ts");
    const layout = read("src/app/layout.tsx");
    const footer = read("src/components/app-shell/footer.tsx");
    const combined = `${marketing}\n${layout}\n${footer}`.toLowerCase();
    expect(marketing).toContain("Databaserad aktieanalys");
    expect(marketing).toContain("Data-driven equity research");
    expect(combined).not.toContain("källbaserad");
    expect(combined).not.toContain("source-backed");
    expect(marketing).toContain("Sources stay visible");
    expect(marketing).toContain("Källorna förblir synliga");
    expect(footer).toContain("visible sources");
  });
});
