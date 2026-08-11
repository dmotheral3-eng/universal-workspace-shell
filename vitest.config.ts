import path from "node:path"
import { defineConfig } from "vitest/config"

/**
 * Separate from vite.config.ts on purpose: the app build has three HTML entries
 * and a dev-only middleware plugin, none of which a test run needs.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: ["server/**/*.test.ts", "src/**/*.test.ts", "test/**/*.test.ts"],
    // The bundle-grep test runs a real `vite build`.
    testTimeout: 180_000,
  },
})
