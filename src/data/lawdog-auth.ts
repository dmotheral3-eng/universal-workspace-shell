/**
 * Law Dog auth — Supabase GoTrue over plain fetch.
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

const STORAGE_KEY = "lawdog.session";

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
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) session = JSON.parse(raw) as LawDogSession;
  } catch {
    session = null;
  }
  return session;
}

function store(s: LawDogSession | null) {
  session = s;
  try {
    if (s) localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    else localStorage.removeItem(STORAGE_KEY);
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
}

let cfg: AuthConfig | null = null;

export function configureAuth(c: AuthConfig) {
  cfg = c;
}

function requireCfg(): AuthConfig {
  if (!cfg) throw new Error("Law Dog auth not configured — call configureAuth() at startup.");
  return cfg;
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
// OAuth — Google and Microsoft (Azure) via GoTrue authorize redirect
// ---------------------------------------------------------------------------

export type OAuthProvider = "google" | "azure";

const PROVIDER_SCOPES: Record<OAuthProvider, string | undefined> = {
  google: undefined,
  azure: "email openid profile",
};

export function signInWithProvider(provider: OAuthProvider, redirectTo?: string): void {
  const { url } = requireCfg();
  const target = redirectTo ?? `${window.location.origin}${window.location.pathname}`;
  const params = new URLSearchParams({ provider, redirect_to: target });
  const scopes = PROVIDER_SCOPES[provider];
  if (scopes) params.set("scopes", scopes);
  window.location.href = `${url}/auth/v1/authorize?${params.toString()}`;
}

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
