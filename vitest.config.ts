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
      // D-BWSHELL-1: these two ids are emitted by the build plugin, which a test
      // run does not load. Point them at the real dev/test modules so unit tests
      // keep exercising runtime profile selection. What actually SHIPS is
      // asserted against real build output in test/profile-bundle.test.ts.
      "virtual:profile-config": path.resolve(import.meta.dirname, "./src/config/profile-config.ts"),
      "virtual:panel-registry": path.resolve(import.meta.dirname, "./src/registry/panel-map.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["server/**/*.test.ts", "src/**/*.test.ts", "test/**/*.test.ts"],
    // The bundle-grep test runs a real `vite build`.
    testTimeout: 180_000,
  },
})
