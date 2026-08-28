import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function source(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("cross-device recovery fallback UI", () => {
  it("shows a retry explanation when recovery PKCE cannot be exchanged", () => {
    const page = source("src/app/auth/forgot/page.tsx");
    expect(page).toContain("retry");
    expect(page).toContain("copy.recoveryRetry");
  });
});
