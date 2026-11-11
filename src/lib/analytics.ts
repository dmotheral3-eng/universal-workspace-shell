/**
 * Product analytics for the workspace shell — the ONE PostHog client in the
 * index.html build (every profile: lending-app, cube, lawdog, borrowworks…).
 *
 * WHY THIS EXISTS (COS-4073). Before this module the shell's only PostHog code
 * was src/shell/door-analytics.ts, which initialised on the first door click
 * with pageviews off — so app., lawdog-app. and lending-app.centripetal-ai.com
 * sent nothing at all, and the key was never set on either Vercel project
 * anyway. door-analytics now routes through here; there is no second loader.
 *
 * Config comes from the environment only. NEXT_PUBLIC_POSTHOG_KEY is the
 * fleet-standard name and the primary; VITE_POSTHOG_KEY (this module's old
 * contract) is still accepted. vite.config.ts lets exactly the
 * NEXT_PUBLIC_POSTHOG_ family through envPrefix — not all of NEXT_PUBLIC_,
 * which would sweep the host's system variables into the bundle. No key VALUE
 * ever appears in this repo. No key at build time → every call is a no-op.
 *
 * The library is LAZILY IMPORTED (its own chunk, fetched after first paint):
 * a static import doubled the gate chunk from 233 kB to 490 kB, which is a bad
 * trade on a screen whose whole job is to appear fast. Calls made before it
 * lands are chained onto the load and run in order.
 */

import type { PostHog, PostHogConfig } from "posthog-js";

const KEY = (
  import.meta.env.NEXT_PUBLIC_POSTHOG_KEY ??
  import.meta.env.VITE_POSTHOG_KEY ??
  ""
).trim();

// US ingestion cluster.
const API_HOST = "https://us.i.posthog.com";
const UI_HOST = "https://us.posthog.com";

export type AnalyticsState = "sending" | "no-key";
export const analyticsState: AnalyticsState = KEY ? "sending" : "no-key";

/**
 * Replay posture follows what the signed-in screens show, and VITE_PROFILE is a
 * build-time constant, so the choice is made per deployment.
 *
 *   health — the unset/`workspace` profile is the healthcare demo, and Law Dog
 *            matters carry medical-provider subpoenas and past-medical figures.
 *            No replay at all, no autocapture (HWM-75 / VER-36).
 *   money  — everything else (lending-app shows loans and books; cube and
 *            borrowworks show client money). Replay masked to the bone.
 *
 * An unknown profile falls to `money`, never to an unmasked default.
 */
const PROFILE = (import.meta.env.VITE_PROFILE ?? "").trim();
const HEALTH_PROFILES = new Set(["", "workspace", "lawdog"]);
export const replayPosture: "health" | "money" = HEALTH_PROFILES.has(PROFILE) ? "health" : "money";

function config(): Partial<PostHogConfig> {
  const base: Partial<PostHogConfig> = {
    api_host: API_HOST,
    ui_host: UI_HOST,
    // SPA: one pageview on load, then one per pushState/replaceState/popstate.
    capture_pageview: "history_change",
    capture_pageleave: true,
    person_profiles: "identified_only",
  };

  if (replayPosture === "health") {
    return {
      ...base,
      disable_session_recording: true,
      autocapture: false,
    };
  }

  return {
    ...base,
    // Session replay records the rendered DOM, so it is the one channel that
    // does not care how careful the event layer is. Everything below this
    // comment is about that gap.
    //
    // Without an explicit session_recording config, replay behaviour is
    // whatever the PostHog project setting happens to be — a setting anyone
    // can flip, in a console, without touching this repo or leaving a diff.
    // The authenticated screens here render borrowers, balances and loan
    // books, so an unmasked replay would carry client financial data out of
    // the estate at full fidelity on every session.
    //
    // These options are therefore set explicitly and locally: the client stops
    // depending on a remote toggle, and the safe state is the one that ships.
    session_recording: {
      // Every input value is masked before it leaves the page.
      maskAllInputs: true,
      // '*' masks the text of every element, not a hand-kept list of selectors.
      // A selector list is a vocabulary that goes stale the moment someone adds
      // a screen, and the failure is silent and in the wrong direction.
      maskTextSelector: "*",
      // Cross-origin frames are not ours to record.
      recordCrossOriginIframes: false,
    },
    // Console output on an authenticated screen routinely carries request and
    // response bodies. Off.
    enable_recording_console_log: false,
  };
}

let client: Promise<PostHog | null> | null = null;

function load(): Promise<PostHog | null> | null {
  if (!KEY || typeof window === "undefined") return null;
  if (!client) {
    client = import("posthog-js")
      .then((m) => {
        m.default.init(KEY, config());
        return m.default;
      })
      // A blocked or failed load must never break the app.
      .catch(() => null);
  }
  return client;
}

/** Fire-and-forget: nothing here is ever awaited by UI code. */
function withClient(fn: (p: PostHog) => void): void {
  const c = load();
  if (!c) return;
  void c.then((p) => p && fn(p)).catch(() => undefined);
}

/** Start the client (and with it the initial $pageview). Safe to call twice. */
export function initAnalytics(): void {
  load();
}

/** Named events only. */
export function capture(event: string, props?: Record<string, unknown>): void {
  withClient((p) => p.capture(event, props));
}

/** On sign-in / session restore. */
export function identifyUser(email: string): void {
  withClient((p) => p.identify(email, { email }));
}

/** The tenant the broker resolved for this session — never a guess. */
export function groupTenant(tenantId: string): void {
  withClient((p) => p.group("tenant", tenantId));
}

/** On sign-out: the next person in this tab starts anonymous. */
export function resetUser(): void {
  withClient((p) => p.reset());
}
