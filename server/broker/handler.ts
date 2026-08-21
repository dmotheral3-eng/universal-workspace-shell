/**
 * The broker itself: the only place in this repo where a Cube credential is used.
 *
 * ORDER OF OPERATIONS IS THE SECURITY MODEL. Each step refuses before the next
 * one can spend anything, and the Cube is not touched until every one of them
 * has passed:
 *
 *   method → resource allowlist → bearer present → master verifies it
 *          → shell tables resolve a tenant → tenant carries the entitlement
 *          → Cube read, tenant filter applied HERE
 *          → rows re-checked against the tenant before they are returned
 *
 * The last step is deliberate belt-and-braces. The filter going up should make
 * a foreign row impossible; if it ever does not — a renamed column, a view that
 * drops the predicate — the rows still do not leave this function.
 *
 * The response never carries upstream error text, upstream URLs, or anything
 * derived from the Cube credential. A caller learns *that* a read failed and
 * nothing more (P#183 — the server shields everything).
 */

import type { BrokerEnv } from "./env.js";
import { lookupResource, type BrokerResource } from "./resources.js";
import {
  entitledBookSlugs,
  isEntitled,
  resolveTenant,
  verifyMasterSession,
  type FetchLike,
} from "./identity.js";

export interface BrokerRequest {
  method: string;
  /** Full request URL, e.g. https://app.example/api/cube/rate_card?limit=50 */
  url: string;
  headers: { get(name: string): string | null };
}

export interface BrokerResponse {
  status: number;
  body: unknown;
  headers: Record<string, string>;
}

export interface BrokerDeps {
  env: BrokerEnv;
  fetch: FetchLike;
  /** Server-side only. Codes, never values. */
  log?: (message: string) => void;
}

/**
 * Filter values are interpolated into a PostgREST query string, where `,` `(`
 * `)` and `.` are operator syntax. Anything outside this set is rejected rather
 * than escaped — the allowlisted filters are ids and short keys, and a value
 * that needs escaping is a value this surface was not built to carry.
 */
const SAFE_VALUE = /^[A-Za-z0-9_:@+\-. ]{1,128}$/;

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  // A tenant-scoped read must never sit in a shared cache.
  "cache-control": "no-store",
};

function refuse(status: number, error: string): BrokerResponse {
  return { status, body: { error }, headers: JSON_HEADERS };
}

/** `/api/cube/rate_card` → `rate_card`. Nested paths are not a thing here. */
export function resourceNameFromPath(pathname: string): string | null {
  const parts = pathname.split("/").filter(Boolean);
  const at = parts.lastIndexOf("cube");
  if (at === -1) return null;
  const rest = parts.slice(at + 1);
  return rest.length === 1 ? rest[0] : null;
}

function bearerFrom(headers: { get(name: string): string | null }): string | null {
  const raw = headers.get("authorization") ?? headers.get("Authorization");
  if (!raw) return null;
  const match = /^Bearer\s+(.+)$/i.exec(raw.trim());
  const token = match?.[1]?.trim();
  return token ? token : null;
}

/**
 * Build the upstream query from the resource definition and the tenant, then
 * fold in only the allowlisted filters. The caller's query string is read for
 * *values*; it never contributes a key, a column, or an operator.
 */
export interface BookFilter {
  column: string;
  values: string[];
}

export function buildCubeQuery(
  resource: BrokerResource,
  tenantId: string,
  callerParams: URLSearchParams,
  bookFilter?: BookFilter | null
): URLSearchParams | { error: string } {
  const params = new URLSearchParams();
  params.set("select", resource.columns.join(","));
  params.set(resource.tenantColumn, `eq.${tenantId}`);

  // The book gate, when the resource declares one. Server-derived: these values
  // come from master's entitlement register, never from the query string.
  if (bookFilter) {
    if (bookFilter.values.length === 0) return { error: "not_entitled" };
    if (!bookFilter.values.every((v) => SAFE_VALUE.test(v))) return { error: "bad_filter" };
    params.set(bookFilter.column, `in.(${bookFilter.values.join(",")})`);
  }

  for (const [name, column] of Object.entries(resource.filters)) {
    const value = callerParams.get(name);
    if (value === null || value === "") continue;
    if (!SAFE_VALUE.test(value)) return { error: "bad_filter" };
    params.set(column, `eq.${value}`);
  }

  if (resource.order) params.set("order", resource.order);

  const asked = Number(callerParams.get("limit"));
  const limit = Number.isFinite(asked) && asked > 0 ? Math.min(asked, resource.maxLimit) : resource.maxLimit;
  params.set("limit", String(Math.floor(limit)));

  return params;
}

export async function handleCubeRequest(
  req: BrokerRequest,
  deps: BrokerDeps
): Promise<BrokerResponse> {
  const log = deps.log ?? (() => undefined);

  // 1. Reads only. The broker is not a write path, and a write path would need
  //    its own ruling about who may mutate a tenant's rows.
  if (req.method.toUpperCase() !== "GET") {
    return refuse(405, "method_not_allowed");
  }

  const url = new URL(req.url);

  // 2. Allowlist before authentication: an unknown resource is a 404 for
  //    everyone, so the surface cannot be enumerated with a valid session.
  const name = resourceNameFromPath(url.pathname);
  const resource = name ? lookupResource(name) : null;
  if (!resource) return refuse(404, "unknown_resource");

  // 3. Anonymous stops here — nothing upstream is contacted at all.
  const token = bearerFrom(req.headers);
  if (!token) return refuse(401, "not_authenticated");

  // 4. Master is the only judge of whether that token is real.
  const user = await verifyMasterSession(token, deps.env, deps.fetch);
  if (!user) return refuse(401, "not_authenticated");

  // 5. Tenant comes from the shell's own tables, never from the request body,
  //    and never from a claim the client could mint.
  const requestedTenant = req.headers.get("x-tenant-id") ?? req.headers.get("X-Tenant-Id");
  const resolution = await resolveTenant(user, token, requestedTenant, deps.env, deps.fetch);
  if (!resolution.ok) {
    return refuse(403, resolution.reason === "ambiguous" ? "tenant_ambiguous" : "tenant_unresolved");
  }
  const { grant } = resolution;

  // 6. Entitlements are per-resource. Absent means no, never "probably fine".
  if (!isEntitled(grant, resource.entitlement)) return refuse(403, "not_entitled");

  // 6b. THE BOOK GATE. A lending tenant can hold more than one book and access
  //     is granted a book at a time, so the tenant filter alone would show a
  //     caller books they were never given. Resolved from master, from the
  //     email master itself verified — the caller supplies nothing here.
  let bookFilter: BookFilter | null = null;
  if (resource.bookScope) {
    const slugs = await entitledBookSlugs(user, token, deps.env, deps.fetch);
    if (slugs.length === 0) {
      log(`no_book_entitlement resource=${name}`);
      return refuse(403, "not_entitled");
    }
    if (resource.bookScope === "slug") {
      bookFilter = { column: "slug", values: slugs };
    } else {
      const ids = await bookIdsForSlugs(slugs, grant.tenantId, deps);
      // Entitled to books, but none of them in this tenant: same refusal as no
      // entitlement at all. Saying which of the two it was would leak the
      // existence of books in another tenant.
      if (ids.length === 0) {
        log(`no_book_in_tenant resource=${name}`);
        return refuse(403, "not_entitled");
      }
      bookFilter = { column: "book_id", values: ids };
    }
  }

  const query = buildCubeQuery(resource, grant.tenantId, url.searchParams, bookFilter);
  if ("error" in query) {
    return refuse(query.error === "not_entitled" ? 403 : 400, query.error);
  }

  // 7. The one call that uses the Cube credential.
  const headers: Record<string, string> = {
    apikey: deps.env.cubeKey,
    Authorization: `Bearer ${deps.env.cubeKey}`,
    Accept: "application/json",
  };
  const schema = resource.schema ?? deps.env.cubeSchema;
  if (schema) headers["Accept-Profile"] = schema;

  let res: Response;
  try {
    res = await deps.fetch(
      `${deps.env.cubeUrl}/rest/v1/${resource.table}?${query.toString()}`,
      { headers }
    );
  } catch {
    log(`cube_unreachable resource=${name}`);
    return refuse(502, "upstream_unavailable");
  }

  if (!res.ok) {
    // Status only. The upstream body can name schemas, columns and hostnames.
    log(`cube_error resource=${name} status=${res.status}`);
    return refuse(502, "upstream_error");
  }

  const rows = (await res.json()) as Array<Record<string, unknown>>;
  if (!Array.isArray(rows)) {
    log(`cube_shape resource=${name}`);
    return refuse(502, "upstream_error");
  }

  // 8. Second gate on the way out (see the header comment).
  const scoped = rows.filter((row) => {
    const value = row[resource.tenantColumn];
    return value === undefined || String(value) === grant.tenantId;
  });
  if (scoped.length !== rows.length) {
    log(`tenant_bleed_blocked resource=${name} dropped=${rows.length - scoped.length}`);
  }

  return {
    status: 200,
    body: { resource: name, tenant: grant.tenantId, rows: scoped },
    headers: JSON_HEADERS,
  };
}

/**
 * The entitled slugs, turned into the book ids the evidence tables key on.
 *
 * Read through the Cube credential like any other brokered read, and scoped to
 * the SAME tenant the caller resolved to — so a slug that exists in another
 * tenant resolves to nothing here rather than to that tenant's book.
 */
async function bookIdsForSlugs(
  slugs: string[],
  tenantId: string,
  deps: BrokerDeps
): Promise<string[]> {
  if (!slugs.every((s) => SAFE_VALUE.test(s))) return [];

  const params = new URLSearchParams();
  params.set("select", "id,slug,tenant_id");
  params.set("tenant_id", `eq.${tenantId}`);
  params.set("slug", `in.(${slugs.join(",")})`);
  params.set("limit", "200");

  let res: Response;
  try {
    res = await deps.fetch(`${deps.env.cubeUrl}/rest/v1/books?${params.toString()}`, {
      headers: {
        apikey: deps.env.cubeKey,
        Authorization: `Bearer ${deps.env.cubeKey}`,
        Accept: "application/json",
        "Accept-Profile": "lending",
      },
    });
  } catch {
    return [];
  }
  if (!res.ok) return [];

  const rows = (await res.json().catch(() => null)) as Array<Record<string, unknown>> | null;
  if (!Array.isArray(rows)) return [];

  // Re-check the tenant on the way out, exactly as the main read does.
  return rows
    .filter((r) => String(r.tenant_id) === tenantId)
    .map((r) => r.id)
    .filter((id): id is string => typeof id === "string");
}
