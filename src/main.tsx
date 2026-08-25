import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "./index.css"
import App from "./App.tsx"
import { getBrand } from "./config"

// D-BWSHELL-1 (2026-08-25), Finding 2: index.html's <title> is the one static,
// generic "Workspace Shell" string every door shares — the on-page brand was
// already per-profile, only the browser tab was not. `getBrand()` already
// resolves per-profile at build time (src/config), so there is no new config
// to add here — just read it once, before the first paint, the same way the
// rest of the shell already treats VITE_PROFILE as fixed for the life of the
// build. The static <title> in index.html stays as the fallback shown to
// crawlers and for the instant before this script runs.
document.title = getBrand().name

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
