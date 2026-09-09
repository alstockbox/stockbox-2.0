import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("batch workbench polling resilience", () => {
  it("uses single-flight timeout polling instead of overlapping intervals", () => {
    const source = readFileSync(resolve(process.cwd(), "src/components/batch/batch-workbench.tsx"), "utf8");

    expect(source).not.toContain("window.setInterval(");
    expect(source).toContain("useRef");
    expect(source).toContain("pollInFlightRef");
    expect(source).toContain("pollFailureCountRef");
    expect(source).toContain("window.setTimeout");
  });

  it("keeps a saved batch id through transient 503 responses", () => {
    const source = readFileSync(resolve(process.cwd(), "src/components/batch/batch-workbench.tsx"), "utf8");
    const removal = "window.localStorage.removeItem(LAST_BATCH_STORAGE_KEY)";

    expect(source).toContain("response.status === 404");
    expect(source).toContain(removal);
    expect(source).toContain("response.status === 503");
    expect(source).toContain("pollFailureCountRef.current");
  });
});
