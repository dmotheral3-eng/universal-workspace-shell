/**
 * Path -> panel, for the handful of surfaces that deserve their own URL.
 *
 * The shell is a panel workspace, not a router, and it stays that way: this does
 * NOT introduce routing, new chrome, or a second page. Landing on /whereweare
 * opens the shell exactly as / does and focuses one panel inside the existing
 * chrome, so the URL is shareable without anything being forked to serve it.
 *
 * The map is a map on purpose — adding a surface here is one entry, and a path
 * that is not in it is simply ignored rather than 404ing inside the app.
 */

import { useEffect } from "react";
import type { PanelType } from "@/config/types";
import { useLayout } from "./layout-context";

export const PATH_PANELS: Record<string, PanelType> = {
  "/whereweare": "WhereWeAre",
};

/** `/whereweare/` and `/whereweare` are the same surface; `/` is not in the map. */
export function panelForPath(pathname: string): PanelType | null {
  const normalised = pathname.replace(/\/+$/, "") || "/";
  return PATH_PANELS[normalised] ?? null;
}

export function PathPanelRoute() {
  const { openPanel } = useLayout();

  useEffect(() => {
    const panel = panelForPath(window.location.pathname);
    if (panel) openPanel(panel);
    // Deliberately once, on load. Re-focusing the panel on every layout change
    // would fight the user the moment they opened anything else.
  }, [openPanel]);

  return null;
}
