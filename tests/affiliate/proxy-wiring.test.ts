import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const rootProxy = readFileSync(join(process.cwd(), "proxy.ts"), "utf8");
const sessionProxy = readFileSync(join(process.cwd(), "src/lib/supabase/proxy.ts"), "utf8");

describe("affiliate proxy wiring", () => {
  it("passes the fetch event so click tracking can run after navigation continues", () => {
    expect(rootProxy).toContain("NextFetchEvent");
    expect(rootProxy).toContain("updateSession(request, event)");
    expect(sessionProxy).toContain("event.waitUntil(tracking)");
  });

  it("keeps attribution first-touch while tracking valid incoming clicks", () => {
    expect(sessionProxy).toContain('if (!existingCode) response.cookies.set("stockbox_ref"');
    expect(sessionProxy).toContain("recordAffiliateClick(request, incomingCode, visitorToken)");
  });
});
