import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const signup = readFileSync(join(process.cwd(), "src/app/auth/signup/page.tsx"), "utf8");
const form = readFileSync(join(process.cwd(), "src/components/auth/auth-form.tsx"), "utf8");

describe("signup referral wiring", () => {
  it("passes the referral cookie into the signup action", () => {
    expect(signup).toContain("stockbox_ref");
    expect(signup).toContain("referralCode=");
    expect(form).toContain('name="referralCode"');
  });
});