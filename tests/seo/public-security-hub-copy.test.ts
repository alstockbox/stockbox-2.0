import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("public security analysis hub copy", () => {
  it("does not describe the mixed public catalog as stocks only", () => {
    const page = read("src/app/aktier/page.tsx");
    expect(page).toContain("Aktier, investmentbolag & ETF");
    expect(page).toContain("aktier, investmentbolag och ETF:er");
    expect(page).toContain('name: `${snapshot.companyName} StockBox-analys`');
    expect(page).toContain("Öppna analysen →");
    expect(page).not.toContain('name: `${snapshot.companyName} aktieanalys`');
  });
});
