import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { devBrokerPlugin } from "./server/dev-broker-plugin"
import { devWhereWeArePlugin } from "./server/dev-whereweare-plugin"
import { devInboxPlugin } from "./server/dev-inbox-plugin"
import { publicSurfaceGatePlugin } from "./build-plugins/public-surface-gate-plugin"

// https://vite.dev/config/
export default defineConfig({
  // devBrokerPlugin is `apply: "serve"` — it mounts /api/cube/* on the dev
  // server only, so the broker can be exercised locally. Nothing from
  // server/ is ever part of a build; test/bundle-secrets.test.ts proves it.
  //
  // publicSurfaceGatePlugin is the opposite shape (`apply: "build"`, lives in
  // build-plugins/ not server/): it only runs when building, writing a real
  // robots.txt and a conditional noindex meta so the two profiles that share
  // this index.html (lending-app, lawdog-app) are safe-by-default while
  // status='building'. See D-NOINDEX-1 / that file's header for the flag.
  plugins: [
    react(),
    tailwindcss(),
    devBrokerPlugin(),
    devWhereWeArePlugin(),
    devInboxPlugin(),
    publicSurfaceGatePlugin(),
  ],
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