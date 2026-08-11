import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

/**
 * Build config for the D-LDUX-2 proof shots ONLY — see scripts/ldux2-proof.sh.
 *
 * Two differences from the product config, both deliberate:
 *
 *  1. `@/data` resolves to proof/data-shim.ts, so panels get fixture rows instead
 *     of a live tenant read. The legal store has no anonymous read path by design
 *     (RLS, FORCE RLS), so an un-shimmed build photographs empty panels.
 *  2. Output goes to dist-proof/, and proof.html is the only entry. Nothing here
 *     can reach the shipped bundle.
 *
 * The alias array is ORDER-SENSITIVE: the exact-match rule for `@/data` has to be
 * tried before the general `@` prefix rule, or every proof build silently gets the
 * real provider back.
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      { find: /^@\/data$/, replacement: path.resolve(__dirname, "./proof/data-shim.ts") },
      { find: /^@\//, replacement: path.resolve(__dirname, "./src") + "/" },
    ],
  },
  build: {
    outDir: "dist-proof",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        proof: path.resolve(__dirname, "proof/proof.html"),
      },
    },
  },
})
