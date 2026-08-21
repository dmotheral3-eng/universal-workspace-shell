/**
 * Identity half of the broker: who is calling, and which tenant are they.
 *
 * Both answers come from MASTER (ulzyudbqkmjistymlqwg) — the auth home the
 * shell already signs everyone into, with Google and Microsoft both live. The
 * Cube is never asked who the user is; it only ever sees a scoped server
 * credential and a tenant filter this file produced.
 *
 * Note what is NOT here: no second master secret. Tenancy is read with the
 * caller's OWN access token, so master's row security is doing the scoping —
 * a user cannot read another user's membership row even if the broker asked
 * for it. Least privilege, and one less key for a human to hold.
 */

import type { BrokerEnv } from "./env";

export type FetchLike = typeof fetch;

export interface MasterUser {
  id: string;
  email: string | null;
}

/**
 * Verify a bearer token against master's GoTrue. A locally-decoded JWT is not
 * verification — the signature, expiry and revocation all live upstream.
 */
export async function verifyMasterSession(
  token: string,
  env: BrokerEnv,
  fetchImpl: FetchLike
): Promise<MasterUser | null> {
  const res = await fetch_(fetchImpl, `${env.masterUrl}/auth/v1/user`, {
    headers: { apikey: env.masterAnonKey, Authorization: `Bearer ${token}` },
  });
  if (!res || !res.ok) return null;

  const json = (await res.json()) as { id?: unknown; email?: unknown };
  if (typeof json.id !== "string" || json.id === "") return null;
  return { id: json.id, email: typeof json.email === "string" ? json.email : null };
}

export interface TenantGrant {
  tenantId: string;
  entitlements: string[];
}

export type TenantResolution =
  | { ok: true; grant: TenantGrant }
  /** No active membership row. The broker refuses — there is no default tenant. */
  | { ok: false; reason: "unresolved" }
  /** Several memberships and no valid X-Tenant-Id. Guessing would be a tenant leak. */
  | { ok: false; reason: "ambiguous" };

interface MembershipRow {
  tenant_id?: unknown;
  entitlements?: unknown;
  status?: unknown;
}

function toEntitlements(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string");
  // Postgres text[] can arrive as `{a,b}` through some proxies.
  if (typeof value === "string" && value.startsWith("{") && value.endsWith("}")) {
    return value
      .slice(1, -1)
      .split(",")
      .map((s) => s.trim().replace(/^"|"$/g, ""))
      .filter(Boolean);
  }
  return [];
}

/**
 * Resolve the caller's tenant from the shell's own table on master.
 *
 * Fail-closed on every ambiguous path: no row, a null tenant, or several
 * tenants without an explicit pick all end in a refusal, never in a guess.
 */
export async function resolveTenant(
  user: MasterUser,
  token: string,
  requestedTenantId: string | null,
  env: BrokerEnv,
  fetchImpl: FetchLike
): Promise<TenantResolution> {
  const params = new URLSearchParams({
    select: "tenant_id,entitlements,status",
    user_id: `eq.${user.id}`,
    status: "eq.active",
    limit: "50",
  });

  const res = await fetch_(
    fetchImpl,
    `${env.masterUrl}/rest/v1/${env.membershipTable}?${params.toString()}`,
    {
      headers: {
        apikey: env.masterAnonKey,
        // The user's own token: master RLS scopes this read, not the broker.
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    }
  );
  if (!res || !res.ok) return { ok: false, reason: "unresolved" };

  const rows = (await res.json()) as MembershipRow[];
  if (!Array.isArray(rows)) return { ok: false, reason: "unresolved" };

  const grants: TenantGrant[] = rows
    .filter((r) => typeof r.tenant_id === "string" && r.tenant_id !== "")
    .map((r) => ({ tenantId: r.tenant_id as string, entitlements: toEntitlements(r.entitlements) }));

  if (grants.length === 0) return { ok: false, reason: "unresolved" };

  if (requestedTenantId) {
    const picked = grants.find((g) => g.tenantId === requestedTenantId);
    // An unmatched X-Tenant-Id is an attempt to read someone else's tenant.
    return picked ? { ok: true, grant: picked } : { ok: false, reason: "unresolved" };
  }

  if (grants.length > 1) return { ok: false, reason: "ambiguous" };
  return { ok: true, grant: grants[0] };
}

/** A wildcard entitlement exists so an operator row does not have to enumerate every panel. */
export function isEntitled(grant: TenantGrant, entitlement: string): boolean {
  return grant.entitlements.includes("*") || grant.entitlements.includes(entitlement);
}

/**
 * Which BOOKS this caller may see, from master.
 *
 * The lending surface grants access one book at a time, so tenant scoping is
 * not the whole answer — a tenant can hold several books. `fn_lending_entitlement`
 * on master is the register of record and this is the only thing that reads it.
 *
 * IT IS CALLED WITH THE EMAIL MASTER JUST VERIFIED, NEVER WITH ONE FROM THE
 * REQUEST. The function is SECURITY DEFINER and takes an email as an argument,
 * so anything that let a caller choose that argument would let them enumerate
 * somebody else's book access. The verified session is the only source of it
 * here, and the broker has no parameter through which a client could supply one.
 *
 * This is a second ENTITLEMENT lookup, not a second auth path: identity is
 * still established once, by `verifyMasterSession`, and this call rides the
 * caller's own token.
 */
export async function entitledBookSlugs(
  user: MasterUser,
  token: string,
  env: BrokerEnv,
  fetchImpl: FetchLike
): Promise<string[]> {
  if (!user.email) return [];

  const res = await fetch_(fetchImpl, `${env.masterUrl}/rest/v1/rpc/fn_lending_entitlement`, {
    method: "POST",
    headers: {
      apikey: env.masterAnonKey,
      Authorization: `Bearer ${token}`,
      "content-type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ p_email: user.email }),
  });
  if (!res || !res.ok) return [];

  const json = (await res.json().catch(() => null)) as { books?: unknown } | null;
  const books = json && Array.isArray(json.books) ? json.books : [];
  return books
    .map((b) => (b && typeof b === "object" ? (b as { book_slug?: unknown }).book_slug : null))
    .filter((s): s is string => typeof s === "string" && s !== "");
}

/** Upstream that is down must read as "not authenticated / not resolved", never as a crash. */
async function fetch_(
  fetchImpl: FetchLike,
  url: string,
  init: RequestInit
): Promise<Response | null> {
  try {
    return await fetchImpl(url, init);
  } catch {
    return null;
  }
}
