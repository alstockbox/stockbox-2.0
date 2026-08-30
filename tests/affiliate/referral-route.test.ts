import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  ilike: vi.fn(),
  eq: vi.fn(),
  maybeSingle: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));

import { GET } from "../../src/app/r/[code]/route";

function adminClient(active = true) {
  const affiliateQuery = {
    select: mocks.select,
    ilike: mocks.ilike,
    eq: mocks.eq,
    maybeSingle: mocks.maybeSingle,
  };
  mocks.select.mockReturnValue(affiliateQuery);
  mocks.ilike.mockReturnValue(affiliateQuery);
  mocks.eq.mockReturnValue(affiliateQuery);
  mocks.maybeSingle.mockResolvedValue({
    data: active ? { id: "affiliate-1", code: "SB_PARTNER" } : null,
    error: null,
  });
  mocks.upsert.mockResolvedValue({ error: null });
  mocks.from.mockImplementation((table: string) =>
    table === "affiliates" ? affiliateQuery : { upsert: mocks.upsert }
  );
  return { from: mocks.from };
}

describe("affiliate referral route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createAdminClient.mockReturnValue(adminClient());
  });

  it("records a legacy click with the new visitor-token model and sets first-touch cookies", async () => {
    const response = await GET(
      new Request("https://stockbox.test/r/sb_partner"),
      { params: Promise.resolve({ code: "sb_partner" }) },
    );
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://stockbox.test/auth/signup");
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("stockbox_ref=SB_PARTNER");
    expect(cookie).toContain("stockbox_ref_visitor=");
    expect(cookie.toLowerCase()).toContain("httponly");
    expect(cookie.toLowerCase()).toContain("samesite=lax");
    expect(cookie).toContain("Max-Age=2592000");
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({
      affiliate_id: "affiliate-1",
      code: "SB_PARTNER",
      visitor_token: expect.any(String),
      landing_path: "/r/sb_partner",
    }), expect.objectContaining({ onConflict: "affiliate_id,visitor_token", ignoreDuplicates: true }));
  });

  it("does not set attribution for an invalid or inactive code", async () => {
    mocks.createAdminClient.mockReturnValue(adminClient(false));
    const response = await GET(
      new Request("https://stockbox.test/r/not_active"),
      { params: Promise.resolve({ code: "not_active" }) },
    );
    expect(response.status).toBe(307);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("preserves an existing first-touch referral cookie", async () => {
    const response = await GET(
      new Request("https://stockbox.test/r/other", {
        headers: { cookie: "stockbox_ref=FIRST_PARTNER; stockbox_ref_visitor=visitor-1" },
      }),
      { params: Promise.resolve({ code: "other" }) },
    );
    expect(response.status).toBe(307);
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});
