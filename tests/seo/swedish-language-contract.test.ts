import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const config = () => readFileSync("next.config.ts", "utf8");

describe("Swedish SEO language contract", () => {
  it("declares Swedish content language on stable Swedish search routes without changing app locale preferences", () => {
    const source = config();
    expect(source).toContain("swedishSeoPaths");
    expect(source).toContain('key: "Content-Language"');
    expect(source).toContain('value: "sv-SE"');
    for (const path of ["/aktieanalys", "/ai-aktieanalys", "/fundamental-analys", "/nyckeltal/:path*", "/aktier/:path*"]) {
      expect(source).toContain(path);
    }
  });
});
