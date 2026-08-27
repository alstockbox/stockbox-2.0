import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";

async function globalHeaderMap(): Promise<Map<string, string>> {
  expect(typeof nextConfig.headers).toBe("function");
  const routes = await nextConfig.headers?.();
  const globalRoute = routes?.find((route) => route.source === "/(.*)");
  expect(globalRoute).toBeDefined();
  return new Map(globalRoute?.headers.map((header) => [header.key, header.value]));
}

describe("security response headers", () => {
  it("sets HSTS and a CSP baseline on every app route", async () => {
    const headers = await globalHeaderMap();

    expect(headers.get("Strict-Transport-Security")).toBe("max-age=31536000; includeSubDomains; preload");

    const csp = headers.get("Content-Security-Policy");
    expect(csp).toEqual(expect.any(String));
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("upgrade-insecure-requests");
  });

  it("keeps the existing browser hardening headers", async () => {
    const headers = await globalHeaderMap();

    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headers.get("X-Frame-Options")).toBe("DENY");
    expect(headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(headers.get("Permissions-Policy")).toBe("camera=(), microphone=(), geolocation=(), payment=(self)");
  });
});
