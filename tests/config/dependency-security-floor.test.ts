import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

type PackageJson = {
  dependencies?: Record<string, string>;
};

type LockPackage = {
  version?: string;
};

type PackageLock = {
  packages?: Record<string, LockPackage>;
};

function versionAtLeast(actual: string | undefined, minimum: string): boolean {
  if (!actual) return false;

  const left = actual.split(".").map((part) => Number.parseInt(part, 10));
  const right = minimum.split(".").map((part) => Number.parseInt(part, 10));
  const length = Math.max(left.length, right.length);

  for (let index = 0; index < length; index += 1) {
    const a = left[index] ?? 0;
    const b = right[index] ?? 0;
    if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
    if (a > b) return true;
    if (a < b) return false;
  }

  return true;
}

describe("production dependency security floors", () => {
  const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as PackageJson;
  const packageLock = JSON.parse(readFileSync("package-lock.json", "utf8")) as PackageLock;

  it("keeps Next.js at or above the patched 16.3.4 release", () => {
    const declaredNext = packageJson.dependencies?.next;
    const lockedNext = packageLock.packages?.["node_modules/next"]?.version;

    expect(versionAtLeast(declaredNext, "16.3.4")).toBe(true);
    expect(versionAtLeast(lockedNext, "16.3.4")).toBe(true);
  });

  it("keeps patched sharp and js-yaml transitive versions", () => {
    const lockedSharp = packageLock.packages?.["node_modules/sharp"]?.version;
    const lockedJsYaml = packageLock.packages?.["node_modules/js-yaml"]?.version;

    expect(versionAtLeast(lockedSharp, "0.35.4")).toBe(true);
    expect(versionAtLeast(lockedJsYaml, "4.3.2")).toBe(true);
  });
});
