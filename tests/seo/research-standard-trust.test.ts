import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const path = "src/app/research-standard/page.tsx";
const read = (file: string) => readFileSync(file, "utf8");

describe("StockBox public research standard", () => {
  it("documents publication, evidence and correction boundaries", () => {
    expect(existsSync(path)).toBe(true);
    if (!existsSync(path)) return;
    const source = read(path);
    expect(source).toContain("Research Standard");
    expect(source).toContain("Publiceringsstandard");
    expect(source).toContain("Datatäckning");
    expect(source).toContain("Konfidens");
    expect(source).toContain("Modellversion");
    expect(source).toContain("Korrigeringar");
    expect(source).toContain("saknad data");
    expect(source).toContain("/contact");
    expect(source).toContain("/docs/methodology");
    expect(source).toContain("/data-sources");
  });

  it("connects the standard to discovery and high-trust surfaces", () => {
    expect(read("src/app/sitemap.ts")).toContain("/research-standard");
    expect(read("src/app/llms.txt/route.ts")).toContain("/research-standard");
    expect(read("src/components/app-shell/footer.tsx")).toContain("/research-standard");
    expect(read("src/app/docs/methodology/page.tsx")).toContain("/research-standard");
    expect(read("src/app/aktier/[slug]/page.tsx")).toContain("/research-standard");
  });
});
