import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    pool: "forks",
    include: ["tests/**/*.test.ts", "src/lib/seo/**/*.test.ts"],
    exclude: [...configDefaults.exclude, "tests/tmp-*.test.ts"],
    coverage: {
      reporter: ["text", "lcov"]
    }
  },
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname
    }
  }
});
