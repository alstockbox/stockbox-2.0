import { describe, expect, it } from "vitest";
import { DEFAULT_POSTHOG_HOST, parseServerEnv } from "../../src/lib/env/server";

describe("server environment parsing", () => {
  it.each([undefined, "", "not-a-url", "://broken"])(
    "falls back for an optional PostHog host value of %s",
    (host) => {
      const env = parseServerEnv({ NEXT_PUBLIC_POSTHOG_HOST: host });
      expect(env.NEXT_PUBLIC_POSTHOG_HOST).toBe(DEFAULT_POSTHOG_HOST);
    }
  );

  it("keeps a valid custom PostHog host", () => {
    const env = parseServerEnv({ NEXT_PUBLIC_POSTHOG_HOST: "https://eu.posthog.com" });
    expect(env.NEXT_PUBLIC_POSTHOG_HOST).toBe("https://eu.posthog.com");
  });
});
