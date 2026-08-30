import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  requireUser: vi.fn(async () => ({
    id: "user_1",
    email: "user@stockbox.test",
    role: "customer"
  }))
}));

import { POST } from "../../src/app/api/stripe/checkout/route";

describe("Stripe checkout plan gate", () => {
  it.each(["free", "enterprise", "unknown"])(
    "rejects unsupported checkout plan %s",
    async (plan) => {
      const response = await POST(new Request("http://localhost/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan })
      }));

      expect(response.status).toBe(422);
      await expect(response.json()).resolves.toEqual({ error: "Invalid plan." });
    }
  );
});