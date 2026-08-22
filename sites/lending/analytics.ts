/**
 * Product analytics for the public surface.
 *
 * The instrumentation is unconditional; the SENDING is not. If the key is absent
 * at build time this module initialises nothing and every call is a no-op — no
 * network request, no console noise, no half-configured client sitting in the
 * page pretending to work.
 *
 * That silence is deliberate and it is also a trap, which is why `analyticsState`
 * exists and why the site prints it into a build marker: an estate that already
 * shipped one bundle believing it was reporting when it was not should never
 * again have to read source code to tell the two states apart. Check the
 * artifact, not the intention.
 */

import posthog from "posthog-js"

const KEY = (import.meta.env.VITE_POSTHOG_KEY ?? "").trim()
const HOST = (import.meta.env.VITE_POSTHOG_HOST ?? "https://us.i.posthog.com").trim()

export type AnalyticsState = "sending" | "no-key"

export const analyticsState: AnalyticsState = KEY ? "sending" : "no-key"

let started = false

export function startAnalytics(): void {
  if (started || !KEY) return
  started = true
  posthog.init(KEY, {
    api_host: HOST,
    capture_pageview: true,
    // A marketing page has no accounts and no sessions worth stitching, and the
    // visitor did not ask to be followed off it.
    persistence: "memory",
    autocapture: false,
  })
}

/** Named events only — an autocaptured click tells you nothing a month later. */
export function track(event: string, props?: Record<string, unknown>): void {
  if (!started) return
  posthog.capture(event, props)
}
