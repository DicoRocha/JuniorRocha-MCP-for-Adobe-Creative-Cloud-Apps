import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/e2e/**/*.e2e.test.ts", "node_modules", "dist", "vendor"],
    testTimeout: 15000,
    hookTimeout: 15000,
    environment: "node",
    // the server defaults to code mode; tests that list or call tools directly need the full set
    env: { JRADB_MCP_TOOLS: "full", JRADB_MCP_SKILLS_GATE: "off" }
  }
});
