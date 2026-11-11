/**
 * One named event from the sign-in door: which provider a person chose.
 *
 * This used to carry its own lazily-initialised PostHog client (pageviews and
 * autocapture off, initialised only on a door click). That client meant the
 * shell sent no pageviews on any host (COS-4073), so the shell now has one
 * client — src/lib/analytics.ts, started at boot — and this module is just the
 * door's named event on top of it. Same env contract, same lazy chunk, same
 * no-key silence.
 *
 * WHY THIS IS NOT sites/lending/analytics.ts. That module is the PUBLIC
 * marketing page's client, a separate build and a separate Vercel project.
 */

import { analyticsState, capture, type AnalyticsState } from "@/lib/analytics";

export type DoorAnalyticsState = AnalyticsState;

export const doorAnalyticsState: DoorAnalyticsState = analyticsState;

/**
 * Fire-and-forget: a click handler must never wait on analytics, and a blocked
 * or failed load must never stop somebody signing in.
 */
export function trackDoorEvent(event: string, props?: Record<string, unknown>): void {
  capture(event, props);
}
