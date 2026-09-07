import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

type VercelConfig = {
  git?: {
    deploymentEnabled?: boolean | Record<string, boolean>;
  };
};

describe("Vercel Git deployment policy", () => {
  it("auto-deploys main while disabling automatic previews for slash-named feature branches", () => {
    const config = JSON.parse(
      readFileSync(resolve(process.cwd(), "vercel.json"), "utf8"),
    ) as VercelConfig;

    expect(config.git?.deploymentEnabled).toEqual({
      main: true,
      "**": false,
    });
  });
});
