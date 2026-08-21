import { describe, expect, it } from "vitest";
import { POST } from "../../src/app/api/stripe/checkout/route";

describe("Stripe checkout plan gate", () => {
  it.each(["standard", "premium", "elite"])(
    "rejects the inactive %s plan before checkout",
    async (plan) => {
      const response = await POST(
        new Request("http://localhost/api/stripe/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ plan })
        })
      );

      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toEqual({
        error: "This plan is not commercially available."
      });
    }
  );
});
