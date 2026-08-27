import { describe, expect, it } from "vitest";
import { safeInternalPath } from "../../src/lib/auth/redirects";

describe("safeInternalPath", () => {
  it.each([
    ["/dashboard", "/dashboard"],
    ["/onboarding?step=2", "/onboarding?step=2"],
    ["/analysis/abc#score", "/analysis/abc#score"],
  ])("keeps a same-origin internal path: %s", (value, expected) => {
    expect(safeInternalPath(value)).toBe(expected);
  });

  it.each([
    "//evil.example/path",
    "/\\evil.example/path",
    "\\evil.example/path",
    "https://evil.example/path",
    "javascript:alert(1)",
    "%2F%2Fevil.example/path",
    "/%5Cevil.example/path",
    "/%255Cevil.example/path",
    "/%2f%2fevil.example/path",
    " /dashboard",
  ])("rejects unsafe redirect input: %s", (value) => {
    expect(safeInternalPath(value)).toBe("/dashboard");
  });

  it("uses the supplied fallback for missing or malformed input", () => {
    expect(safeInternalPath(null, "/auth/login")).toBe("/auth/login");
    expect(safeInternalPath("/%E0%A4%A", "/auth/login")).toBe("/auth/login");
  });
});
