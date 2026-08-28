import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const source = (path: string) => readFileSync(`${root}/${path}`, "utf8");

describe("new password UI", () => {
  it("marks signup and reset as new-password flows with the strong policy hint", () => {
    const signup = source("src/app/auth/signup/page.tsx");
    const reset = source("src/app/auth/reset/page.tsx");

    for (const page of [signup, reset]) {
      expect(page).toContain('passwordMode="new"');
      expect(page).toContain("passwordHint={copy.strongPasswordRequirement}");
    }
  });

  it("uses 12-character browser validation only for new passwords", () => {
    const form = source("src/components/auth/auth-form.tsx");
    expect(form).toContain('passwordMode?: "current" | "new"');
    expect(form).toContain('minLength={passwordMode === "new" ? 12 : 8}');
    expect(form).toContain('autoComplete={passwordMode === "new" ? "new-password" : "current-password"}');
  });
});
