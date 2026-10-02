/**
 * Refine's auth provider — a WRAPPER, not a second auth (BOR-131).
 *
 * The shell already has exactly one way to be signed in: `lawdog-auth.ts`
 * against master, with the gate (`LawDogGate`) as the sign-in screen. This file
 * adds nothing to that. It answers Refine's five questions by asking the
 * module that already knows, so `useGetIdentity`, `usePermissions`,
 * `<Authenticated>` and the mutation error path have something to read.
 *
 * WHERE EACH ANSWER COMES FROM, because they are not all the same place:
 *
 *   check          the session lawdog-auth holds (refreshed if it is about to
 *                  expire). No network call when the token is fresh.
 *   getIdentity    the session's email, plus the tenant the BROKER resolved.
 *   getPermissions the entitlement keys the BROKER resolved — `/api/cube/whoami`.
 *
 * The last two deliberately do NOT decode roles out of the token in the
 * browser. A master token says who you are; what you may do lives in the
 * shell's membership table, and the broker reads that on every request. Asking
 * the broker means the roles a screen shows are the roles the server is about
 * to enforce. Reading them out of a JWT here would be a second opinion.
 *
 * "READ ONCE": the whoami answer is cached per access token. A new token (a
 * refresh, another user) is a new question; sign-out forgets everything.
 *
 * NO REDIRECT ON A FAILED CHECK, AND THAT IS DELIBERATE. The ticket sketches
 * `redirect: "/login"`. This shell has no `/login` route — the gate renders the
 * sign-in screen in place whenever there is no session, and the shell owns the
 * address bar (`syncWithLocation: false`). Sending Refine to a URL that does not
 * exist would put two routers in a fight to show a screen that is already
 * showing. A signed-out check therefore returns `{authenticated: false,
 * logout: true}` and the gate does the rest.
 *
 * A REFUSAL IS NOT A LOGOUT. `onError` signs the user out only when the server
 * said the SESSION is no good. "You may not do that" is an answer to show, and
 * signing someone out for asking would both hide the answer and punish the
 * question.
 */

import type { AuthProvider } from "@refinedev/core";
import {
  getAccessToken,
  getSession,
  onAuthChange,
  signIn,
  signInWithProvider,
  signOut,
  type OAuthProvider,
} from "./lawdog-auth";
import { getConfig } from "@/config";

/** What the broker says about the caller. Mirrors server/broker/whoami.ts. */
export interface WhoAmI {
  user: { id: string; email: string | null };
  tenant: string | null;
  entitlements: string[];
  tenantState: "resolved" | "unresolved" | "ambiguous";
}

export interface ShellIdentity {
  id: string;
  name: string;
  email: string | null;
  tenant: string | null;
}

/** The only code that means "your session is the problem". */
const AUTH_REFUSAL_CODES = new Set(["not_authenticated"]);

const WHOAMI_TIMEOUT_MS = 15_000;

let cached: { token: string; answer: Promise<WhoAmI | null> } | null = null;

// A sign-in, a sign-out or a refresh all change the token; the cache is keyed
// on it, but dropping it here as well means a signed-out tab holds nothing.
onAuthChange(() => {
  cached = null;
});

async function fetchWhoAmI(token: string): Promise<WhoAmI | null> {
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  const pinned = getConfig().data.broker?.tenantId;
  if (pinned) headers["X-Tenant-Id"] = pinned;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WHOAMI_TIMEOUT_MS);
  try {
    const res = await fetch("/api/cube/whoami", { headers, signal: controller.signal });
    if (!res.ok) return null;
    const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    const user = json?.user as { id?: unknown; email?: unknown } | undefined;
    if (!json || !user || typeof user.id !== "string") return null;

    const state = json.tenant_state;
    return {
      user: { id: user.id, email: typeof user.email === "string" ? user.email : null },
      tenant: typeof json.tenant === "string" ? json.tenant : null,
      entitlements: Array.isArray(json.entitlements)
        ? json.entitlements.filter((e): e is string => typeof e === "string")
        : [],
      tenantState: state === "resolved" || state === "ambiguous" ? state : "unresolved",
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The broker's answer for the current session, asked at most once per token.
 * Null means signed out, or the broker could not be asked — never "no roles".
 */
export async function whoAmI(): Promise<WhoAmI | null> {
  // A profile with no broker has no door to ask, and asking would only 404.
  if (getConfig().data.mode !== "cube-broker") return null;

  const token = await getAccessToken();
  if (!token) return null;

  if (cached?.token !== token) {
    const answer = fetchWhoAmI(token);
    cached = { token, answer };
    // A failed lookup is not remembered: the next caller asks again rather than
    // inheriting "no answer" for the life of the token.
    answer.then((a) => {
      if (a === null && cached?.token === token) cached = null;
    });
  }
  return cached.answer;
}

export const shellAuthProvider: AuthProvider = {
  check: async () => {
    const token = await getAccessToken();
    return token ? { authenticated: true } : { authenticated: false, logout: true };
  },

  /**
   * Delegates to the flows the gate already uses. `{provider}` starts the
   * redirect sign-in (the page leaves; nothing resolves on this side of it).
   * `{email, password}` is the existing password flow.
   */
  login: async (params: { provider?: OAuthProvider; email?: string; password?: string } = {}) => {
    try {
      if (params.provider) {
        signInWithProvider(params.provider);
        return { success: true };
      }
      if (params.email && params.password) {
        await signIn(params.email, params.password);
        return { success: true };
      }
      return { success: false, error: new Error("No sign-in method given") };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e : new Error("Sign-in failed") };
    }
  },

  logout: async () => {
    await signOut();
    return { success: true };
  },

  getIdentity: async (): Promise<ShellIdentity | null> => {
    const session = getSession();
    if (!session) return null;

    const who = await whoAmI();
    const email = who?.user.email ?? session.email ?? null;
    return {
      // Without the broker's answer the id is the email: it is the only stable
      // thing the session itself carries, and it is what the evidence rows name.
      id: who?.user.id ?? email ?? "",
      name: email ?? "",
      email,
      tenant: who?.tenant ?? null,
    };
  },

  getPermissions: async (): Promise<string[]> => {
    const who = await whoAmI();
    return who?.entitlements ?? [];
  },

  onError: async (error: { code?: unknown } | null | undefined) => {
    const code = error?.code;
    if (typeof code === "string" && AUTH_REFUSAL_CODES.has(code)) {
      return { logout: true, error: new Error(code) };
    }
    // Every other code — a refusal, a timeout, an upstream fault — is an answer
    // for the screen to show.
    return {};
  },
};
