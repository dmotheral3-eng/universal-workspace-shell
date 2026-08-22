import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "./site.css"
import App from "./App"
import { analyticsState, startAnalytics } from "./analytics"

startAnalytics()

// A build marker, not a log line for its own sake. The estate has already
// shipped one bundle that believed it was reporting and was not; a reader can
// now tell the two states apart from the artifact in front of them.
document.documentElement.setAttribute("data-analytics", analyticsState)

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
