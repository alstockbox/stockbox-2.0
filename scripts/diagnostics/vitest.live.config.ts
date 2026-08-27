import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["scripts/diagnostics/**/*.test.ts"],
    testTimeout: 600_000,
  },
  resolve: {
    alias: {
      "@": new URL("../../src", import.meta.url).pathname,
    },
  },
});
