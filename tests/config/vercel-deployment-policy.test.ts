import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

type VercelConfig = {
  git?: {
    deploymentEnabled?: boolean | Record<string, boolean>;
  };
};

describe("Vercel Git deployment policy", () => {
  it("auto-deploys main while disabling automatic previews for slash-delimited feature branches", () => {
    const config = JSON.parse(
      readFileSync(resolve(process.cwd(), "vercel.json"), "utf8"),
    ) as VercelConfig;

    // Vercel evaluates these keys with minimatch. A single `*` does not
    // cover slash-delimited refs such as `feat/foo` or `fix/bar`, so the
    // fallback must be a globstar. `main: true` still wins when both rules
    // match because Vercel deploys if at least one matching rule is true.
    expect(config.git?.deploymentEnabled).toEqual({
      main: true,
      "**": false,
    });
  });
});
