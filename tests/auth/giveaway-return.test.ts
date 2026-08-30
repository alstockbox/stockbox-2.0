import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "../..");
const actions = readFileSync(join(root, "src/lib/auth/actions.ts"), "utf8");
const form = readFileSync(join(root, "src/components/auth/auth-form.tsx"), "utf8");
const login = readFileSync(join(root, "src/app/auth/login/page.tsx"), "utf8");
const signup = readFileSync(join(root, "src/app/auth/signup/page.tsx"), "utf8");

describe("giveaway auth return flow", () => {
  it("carries a safe internal next path through login and signup", () => {
    expect(actions).toContain("safeInternalPath");
    expect(actions).toContain('formData.get("next")');
    expect(form).toContain('name="next"');
    expect(login).toContain("nextPath");
    expect(signup).toContain("nextPath");
  });
});
