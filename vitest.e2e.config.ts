import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/e2e/**/*.e2e.test.ts"],
    exclude: ["node_modules", "dist", "vendor"],
    testTimeout: 30000,
    hookTimeout: 30000,
    environment: "node"
  }
});
