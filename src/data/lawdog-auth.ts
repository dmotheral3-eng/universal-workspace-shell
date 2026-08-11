/**
 * The shell's GoTrue client — Supabase auth over plain fetch.
 *
 * Named for Law Dog because that is what it was written for; it is now the one
 * sign-in implementation for BOTH doors, configured per profile by
 * `configureAuth()` (src/shell/lawdog-gate.tsx). The Law Dog profile points it
 * at Law Dog's own project; the cube profile points it at MASTER
 * (app.centripetal-ai.com), where Google and Microsoft are both already live.
 * Reuse-first: a second copy of PKCE is a second copy of the 2026-08-09 bug.
 *
 * No @supabase/supabase-js, matching the adapter. This exists so the shell can
 * hold a real user session instead of relying on the anon role.
 *
 * WHY THIS AND NOT AN ANON READ POLICY: every table in the Law Dog case store has
 * RLS on with policies scoped to {authenticated} and no anon policy. That is the
 * correct posture for an evidence store — the case file is not publicly readable.
 * Opening an anon policy to make panels render would create the exact hole that
 * currently does not exist. So the shell authenticates instead.
 *
 * Tokens live in localStorage. That is appropriate for an internal operator surface
 * on a machine you control; it would NOT be appropriate for a client-facing portal
 * carrying other people's matters.
 */

const DEFAULT_STORAGE_KEY = "lawdog.session";

/** Which localStorage key holds the session. Per door — two doors on one origin
 *  must not overwrite each other's session. Set by configureAuth(). */
let storageKey = DEFAULT_STORAGE_KEY;

export interface LawDogSession {
  access_token: string;
  refresh_token: string;
  expires_at: number; // epoch seconds
  email: string;
}

let session: LawDogSession | null = null;
let refreshing: Promise<LawDogSession | null> | null = null;
const listeners = new Set<(s: LawDogSession | null) => void>();

function load(): LawDogSession | null {
  if (session) return session;
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) session = JSON.parse(raw) as LawDogSession;
  } catch {
    session = null;
  }
  return session;
}

function store(s: LawDogSession | null) {
  session = s;
  try {
    if (s) localStorage.setItem(storageKey, JSON.stringify(s));
    else localStorage.removeItem(storageKey);
  } catch {
    /* private browsing — session stays in memory only */
  }
  listeners.forEach((fn) => fn(s));
}

export function onAuthChange(fn: (s: LawDogSession | null) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getSession(): LawDogSession | null {
  return load();
}

export function isSignedIn(): boolean {
  const s = load();
  return !!s && s.expires_at * 1000 > Date.now();
}

interface AuthConfig {
  url: string;
  anonKey: string;
  /** Defaults to "lawdog.session" so the Law Dog door is byte-for-byte unchanged. */
  storageKey?: string;
}

let cfg: AuthConfig | null = null;

export function configureAuth(c: AuthConfig) {
  cfg = c;
  const nextKey = c.storageKey ?? DEFAULT_STORAGE_KEY;
  if (nextKey !== storageKey) {
    // Switching doors: drop the in-memory session so a cached one from the
    // previous door is never handed to the new one.
    storageKey = nextKey;
    session = null;
  }
}

function requireCfg(): AuthConfig {
  if (!cfg) throw new Error("Shell auth not configured — call configureAuth() at startup.");
  return cfg;
}

/** The PKCE verifier is scoped to the door too. The default door keeps its
 *  historical key so a sign-in already in flight at deploy time still lands. */
function verifierKey(): string {
  return storageKey === DEFAULT_STORAGE_KEY ? VERIFIER_KEY : `${storageKey}.pkce_verifier`;
}

function toSession(json: Record<string, unknown>, fallbackEmail: string): LawDogSession {
  const user = json.user as { email?: string } | undefined;
  return {
    access_token: String(json.access_token),
    refresh_token: String(json.refresh_token),
    expires_at:
      typeof json.expires_at === "number"
        ? json.expires_at
        : Math.floor(Date.now() / 1000) + Number(json.expires_in ?? 3600),
    email: user?.email ?? fallbackEmail,
  };
}

export async function signIn(email: string, password: string): Promise<LawDogSession> {
  const { url, anonKey } = requireCfg();
  const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(String(json.error_description ?? json.msg ?? json.error ?? "Sign-in failed"));
  }
  const s = toSession(json, email);
  store(s);
  return s;
}

export async function signOut(): Promise<void> {
  const s = load();
  if (s) {
    const { url, anonKey } = requireCfg();
    await fetch(`${url}/auth/v1/logout`, {
      method: "POST",
      headers: { apikey: anonKey, Authorization: `Bearer ${s.access_token}` },
    }).catch(() => undefined);
  }
  store(null);
}

async function refresh(): Promise<LawDogSession | null> {
  const s = load();
  if (!s?.refresh_token) return null;
  const { url, anonKey } = requireCfg();
  const res = await fetch(`${url}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: s.refresh_token }),
  });
  if (!res.ok) {
    store(null);
    return null;
  }
  const next = toSession(await res.json(), s.email);
  store(next);
  return next;
}

/**
 * The token the adapter should send. Refreshes 60s before expiry, and collapses
 * concurrent refreshes so six panels loading at once do not fire six requests.
 */
export async function getAccessToken(): Promise<string | null> {
  const s = load();
  if (!s) return null;
  if (s.expires_at * 1000 > Date.now() + 60_000) return s.access_token;
  if (!refreshing) {
    refreshing = refresh().finally(() => {
      refreshing = null;
    });
  }
  const next = await refreshing;
  return next?.access_token ?? null;
}

// ---------------------------------------------------------------------------
// OAuth — Google and Microsoft (Azure) via GoTrue authorize redirect, PKCE only
// ---------------------------------------------------------------------------
//
// WHY PKCE AND NOT IMPLICIT: the implicit flow hands the provider back
// access_token, provider_token and refresh_token in the URL *fragment*. On
// 2026-08-09 a production sign-in landed on a stale dev host and those three
// secrets rode along in the fragment of a URL the operator did not control.
// PKCE makes that class of leak impossible: the redirect carries a one-time
// authorization code in the query string, and a code is inert without the
// code_verifier — which never leaves this browser's sessionStorage.

export type OAuthProvider = "google" | "azure";

const PROVIDER_SCOPES: Record<OAuthProvider, string | undefined> = {
  google: undefined,
  azure: "email openid profile",
};

/**
 * sessionStorage, not localStorage: the verifier is single-use and must not
 * outlive the tab that started the sign-in. It is cleared the moment the code
 * is exchanged (and on any failure path).
 */
const VERIFIER_KEY = "lawdog.pkce_verifier";

function base64url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** 64 random bytes → 86 base64url chars, inside RFC 7636's 43–128 range. */
function createVerifier(): string {
  const bytes = new Uint8Array(64);
  crypto.getRandomValues(bytes);
  return base64url(bytes);
}

async function deriveChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(digest));
}

function takeVerifier(): string | null {
  try {
    const key = verifierKey();
    const v = sessionStorage.getItem(key);
    sessionStorage.removeItem(key);
    return v;
  } catch {
    return null;
  }
}

/**
 * Kick off a PKCE sign-in. Signature is unchanged (fire-and-forget, returns
 * void) because callers are click handlers; the crypto is async, so the
 * navigation happens once the challenge is derived.
 *
 * redirect_to defaults to the bare origin so the same build is correct on prod,
 * the vercel alias and localhost. Which origins are actually accepted is
 * governed by the Supabase URL allowlist, dashboard-side.
 */
export function signInWithProvider(provider: OAuthProvider, redirectTo?: string): void {
  const { url } = requireCfg();
  const target = redirectTo ?? window.location.origin;

  void (async () => {
    const verifier = createVerifier();
    const challenge = await deriveChallenge(verifier);
    try {
      sessionStorage.setItem(verifierKey(), verifier);
    } catch {
      // No sessionStorage means no way to hold the verifier across the
      // redirect, and there is no implicit flow to fall back to any more.
      // Stop here rather than send the operator into a flow that cannot finish.
      console.error("Law Dog sign-in unavailable: sessionStorage is blocked in this browser.");
      return;
    }

    const params = new URLSearchParams({
      provider,
      flow_type: "pkce",
      code_challenge: challenge,
      code_challenge_method: "s256",
      redirect_to: target,
    });
    const scopes = PROVIDER_SCOPES[provider];
    if (scopes) params.set("scopes", scopes);
    window.location.href = `${url}/auth/v1/authorize?${params.toString()}`;
  })();
}

function scrubQuery() {
  const q = new URLSearchParams(window.location.search);
  for (const k of ["code", "state", "error", "error_code", "error_description"]) q.delete(k);
  const search = q.toString();
  window.history.replaceState(
    null,
    "",
    window.location.pathname + (search ? `?${search}` : "") + window.location.hash,
  );
}

let exchanging: Promise<LawDogSession | null> | null = null;

/**
 * Call once on load. Exchanges a PKCE `?code=` for a session; falls back to the
 * legacy fragment handler when there is no code.
 *
 * Concurrent calls share one exchange — a code is single-use, and React strict
 * mode double-invokes effects.
 */
export function completeOAuthRedirect(): Promise<LawDogSession | null> {
  if (!exchanging) {
    exchanging = exchangePkceCode().finally(() => {
      exchanging = null;
    });
  }
  return exchanging;
}

async function exchangePkceCode(): Promise<LawDogSession | null> {
  const query = new URLSearchParams(window.location.search);

  const err = query.get("error_description") ?? query.get("error");
  if (err) {
    takeVerifier();
    scrubQuery();
    throw new Error(decodeURIComponent(err.replace(/\+/g, " ")));
  }

  const code = query.get("code");
  if (!code) return consumeOAuthRedirect();

  const verifier = takeVerifier();
  // Scrub before the network call: the code must not survive in the address bar
  // or in history, whether or not the exchange succeeds.
  scrubQuery();
  if (!verifier) {
    throw new Error(
      "Sign-in could not be completed — this tab has no PKCE verifier. " +
        "Start the sign-in and finish it in the same tab.",
    );
  }

  const { url, anonKey } = requireCfg();
  const res = await fetch(`${url}/auth/v1/token?grant_type=pkce`, {
    method: "POST",
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ auth_code: code, code_verifier: verifier }),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(
      String(json.error_description ?? json.msg ?? json.error ?? "OAuth sign-in failed"),
    );
  }

  const s = toSession(json, readEmailFromJwt(String(json.access_token)) ?? "");
  store(s);
  return s;
}

/**
 * LEGACY implicit-flow fragment handler — FALLBACK ONLY, sunset after one
 * release. No new sign-in takes this path: signInWithProvider() always requests
 * flow_type=pkce. It stays so that a redirect already in flight at the moment
 * of the cutover (an operator who hit "Continue with Google" against the old
 * build) still lands in a session instead of a dead login screen.
 *
 * Delete this function, and its call in exchangePkceCode(), in the release
 * after the PKCE cutover.
 */
export function consumeOAuthRedirect(): LawDogSession | null {
  if (!window.location.hash || window.location.hash.length < 2) return null;

  const frag = new URLSearchParams(window.location.hash.slice(1));
  const scrub = () =>
    window.history.replaceState(null, "", window.location.pathname + window.location.search);

  const err = frag.get("error_description") ?? frag.get("error");
  if (err) {
    scrub();
    throw new Error(decodeURIComponent(err.replace(/\+/g, " ")));
  }

  const access_token = frag.get("access_token");
  const refresh_token = frag.get("refresh_token");
  if (!access_token || !refresh_token) return null;

  const expiresIn = Number(frag.get("expires_in") ?? 3600);
  const s: LawDogSession = {
    access_token,
    refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + expiresIn,
    email: readEmailFromJwt(access_token) ?? "",
  };

  store(s);
  scrub();
  return s;
}

function readEmailFromJwt(token: string): string | null {
  try {
    const payload = token.split(".")[1];
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const claims = JSON.parse(json) as { email?: string };
    return claims.email ?? null;
  } catch {
    return null;
  }
}
