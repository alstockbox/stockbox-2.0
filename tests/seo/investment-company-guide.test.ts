import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const path = "src/app/guider/analysera-investmentbolag/page.tsx";
const read = (file: string) => readFileSync(file, "utf8");

describe("investment company SEO and AIO guide", () => {
  it("publishes a dedicated Swedish investment-company analysis guide", () => {
    expect(existsSync(path)).toBe(true);
    if (!existsSync(path)) return;
    const source = read(path);
    expect(source).toContain("Analysera investmentbolag");
    expect(source).toContain("substansvärde");
    expect(source).toContain("substansrabatt");
    expect(source).toContain("NAV / SOTP");
    expect(source).toContain("P/E");
    expect(source).toContain("No Rating");
    expect(source).toContain("/docs/methodology");
    expect(source).toContain("/aktier");
  });

  it("connects the guide into the guide hub, sitemap and AI discovery map", () => {
    expect(read("src/app/guider/page.tsx")).toContain("/guider/analysera-investmentbolag");
    expect(read("src/app/sitemap.ts")).toContain("/guider/analysera-investmentbolag");
    expect(read("src/app/llms.txt/route.ts")).toContain("/guider/analysera-investmentbolag");
  });
});
