import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("webmaster verification readiness", () => {
  it("documents Google and Bing verification environment variables", () => {
    const envExample = read(".env.example");
    expect(envExample).toContain("GOOGLE_SITE_VERIFICATION=");
    expect(envExample).toContain("BING_SITE_VERIFICATION=");
  });

  it("accepts search verification settings in the server environment", () => {
    const env = read("src/lib/env/server.ts");
    expect(env).toContain("GOOGLE_SITE_VERIFICATION");
    expect(env).toContain("BING_SITE_VERIFICATION");
  });

  it("wires verification meta tags into root metadata", () => {
    const layout = read("src/app/layout.tsx");
    expect(layout).toContain("verification:");
    expect(layout).toContain("GOOGLE_SITE_VERIFICATION");
    expect(layout).toContain('"msvalidate.01"');
  });
});
