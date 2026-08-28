import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("admin operations center", () => {
  it("shows runtime provider health rather than configuration state only", () => {
    const source = readFileSync(join(process.cwd(), "src/app/admin/page.tsx"), "utf8");
    expect(source).toContain('.from("provider_health")');
    expect(source).toContain("latency_ms");
    expect(source).toContain("Runtime health");
    expect(source).toContain("Success rate");
  });

  it("shows recent sanitized application errors to admins", () => {
    const source = readFileSync(join(process.cwd(), "src/app/admin/page.tsx"), "utf8");
    expect(source).toContain('select("id,service,sanitized_error,created_at")');
    expect(source).toContain("Recent application errors");
    expect(source).not.toContain("context->>");
  });
});