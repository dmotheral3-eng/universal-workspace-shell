import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { devBrokerPlugin } from "./server/dev-broker-plugin"

// https://vite.dev/config/
export default defineConfig({
  // devBrokerPlugin is `apply: "serve"` — it mounts /api/cube/* on the dev
  // server only, so the broker can be exercised locally. Nothing from
  // server/ is ever part of a build; test/bundle-secrets.test.ts proves it.
  plugins: [react(), tailwindcss(), devBrokerPlugin()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, "index.html"),
        popout: path.resolve(__dirname, "popout.html"),
        // fixture harness for the legal panels — see src/panels-preview.tsx
        panels: path.resolve(__dirname, "panels.html"),
      },
    },
  },
})