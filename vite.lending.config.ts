import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

/**
 * The public lending surface — its own build target, its own Vercel project.
 *
 * Same shape as vite.proof.config.ts: a second entry with its own root and its
 * own outDir, so nothing here can reach the product bundle and nothing in the
 * product bundle is dragged into a marketing page.
 *
 * `@` still resolves to src/ because the hero renders the REAL operator
 * component (src/bw/scan-register.tsx) rather than a picture of it. That is the
 * point of the hero: the screen on the marketing page is the screen.
 */
export default defineConfig({
  root: path.resolve(__dirname, "sites/lending"),
  publicDir: path.resolve(__dirname, "sites/lending/public"),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  build: {
    outDir: path.resolve(__dirname, "dist-lending"),
    emptyOutDir: true,
  },
  server: { port: 5312, strictPort: true },
})
