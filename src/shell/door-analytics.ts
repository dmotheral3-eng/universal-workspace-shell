/**
 * One named event from the sign-in door: which provider a person chose.
 *
 * WHY THIS IS NOT sites/lending/analytics.ts. That module is the PUBLIC
 * marketing page's client: it initialises on load and captures pageviews,
 * which is right for a page anyone can read and wrong for a gated workspace.
 * This one shares that module's env contract (VITE_POSTHOG_KEY /
 * VITE_POSTHOG_HOST — one key, one host, no second thing to rotate) and
 * nothing else.
 *
 * The posture here is deliberately the smallest thing that answers the
 * question "did the Microsoft door get used":
 *   - the library itself is LAZILY IMPORTED on the first door click, so it is
 *     its own chunk and never rides in the door's bundle — a static import here
 *     doubled the gate chunk from 233 kB to 490 kB for one event, which is a
 *     bad trade on a screen whose whole job is to appear fast;
 *   - autocapture and pageviews are OFF, so nothing inside the workspace is
 *     observed — only the door press itself;
 *   - persistence is in memory, so no identifier outlives the tab.
 *
 * With no key at build time this module initialises nothing and every call is
 * a no-op — same silence, and the same trap, as the marketing module documents.
 * `doorAnalyticsState` exists so the two states can be told apart from the
 * artifact rather than from the source.
 */

const KEY = (import.meta.env.VITE_POSTHOG_KEY ?? "").trim();
const HOST = (import.meta.env.VITE_POSTHOG_HOST ?? "https://us.i.posthog.com").trim();

export type DoorAnalyticsState = "sending" | "no-key";

export const doorAnalyticsState: DoorAnalyticsState = KEY ? "sending" : "no-key";

let client: Promise<typeof import("posthog-js").default> | null = null;

/**
 * Named events only, and only from the door. Fire-and-forget: a click handler
 * must never wait on analytics, and a blocked or failed load must never stop
 * somebody signing in — hence the swallowed rejection.
 */
export function trackDoorEvent(event: string, props?: Record<string, unknown>): void {
  if (!KEY) return;
  if (!client) {
    client = import("posthog-js").then((m) => {
      m.default.init(KEY, {
        api_host: HOST,
        capture_pageview: false,
        autocapture: false,
        persistence: "memory",
      });
      return m.default;
    });
  }
  void client.then((p) => p.capture(event, props)).catch(() => undefined);
}
