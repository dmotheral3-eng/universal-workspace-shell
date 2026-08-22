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
  /**
   * The parsed JSON body, present only on the single POST this surface allows.
   * Optional so every read caller — and every existing test — constructs a
   * request exactly as it did before.
   */
  json?: () => Promise<unknown>;
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

  // 1. Reads, and exactly ONE write.
  //
  //    This used to be reads-only, with the note that "a write path would need
  //    its own ruling about who may mutate a tenant's rows." D-BWUI-1 is that
  //    ruling, and it is deliberately the narrowest one that can exist: a single
  //    resource, append-only, where the caller supplies a verdict and a reason
  //    and NOTHING else. Identity, tenant and the book gate are all re-derived
  //    server-side exactly as they are for a read — see handleDecisionWrite.
  const method = req.method.toUpperCase();
  if (method === "POST") {
    return handleDecisionWrite(req, deps);
  }
  if (method !== "GET") {
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

/* ------------------------------------------------------------------ write ---
 * THE ONLY WRITE ON THIS SURFACE.
 *
 * A review screen whose Confirm button produces no row is a picture of a control,
 * not the control. So the action register records what a human decided — and to
 * stay a control rather than a hole, this path re-runs every gate the read path
 * runs and takes as little from the caller as it possibly can.
 *
 * The caller supplies: which exception, which verdict, why, and the rule version
 * they were shown. The caller does NOT supply: who they are, which tenant they
 * are in, or whether they may touch that book. Those are re-derived here from the
 * session master verified, which is the difference between an audited decision
 * and an assertion.
 */
export async function handleDecisionWrite(
  req: BrokerRequest,
  deps: BrokerDeps
): Promise<BrokerResponse> {
  const log = deps.log ?? (() => undefined);
  const url = new URL(req.url);

  // Exactly one resource may be written, whatever the path says.
  const name = resourceNameFromPath(url.pathname);
  if (name !== "lending_decision_log") return refuse(404, "unknown_resource");
  const resource = lookupResource(name);
  if (!resource) return refuse(404, "unknown_resource");

  const token = bearerFrom(req.headers);
  if (!token) return refuse(401, "not_authenticated");

  const user = await verifyMasterSession(token, deps.env, deps.fetch);
  if (!user) return refuse(401, "not_authenticated");

  const requestedTenant = req.headers.get("x-tenant-id") ?? req.headers.get("X-Tenant-Id");
  const resolution = await resolveTenant(user, token, requestedTenant, deps.env, deps.fetch);
  if (!resolution.ok) {
    return refuse(403, resolution.reason === "ambiguous" ? "tenant_ambiguous" : "tenant_unresolved");
  }
  const { grant } = resolution;
  if (!isEntitled(grant, resource.entitlement)) return refuse(403, "not_entitled");

  if (typeof req.json !== "function") return refuse(400, "bad_body");
  let body: Record<string, unknown>;
  try {
    body = ((await req.json()) ?? {}) as Record<string, unknown>;
  } catch {
    return refuse(400, "bad_body");
  }

  const bookId = typeof body.book_id === "string" ? body.book_id : "";
  const subjectKind = typeof body.subject_kind === "string" ? body.subject_kind : "";
  const subjectRef = typeof body.subject_ref === "string" ? body.subject_ref : "";
  const action = body.action === "confirmed" || body.action === "waived" ? body.action : "";
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  const ruleVersion = typeof body.rule_version === "string" ? body.rule_version : "";

  // A blank reason is the exact thing this record exists to prevent, so it is
  // refused here as well as by the column constraint.
  if (!bookId || !subjectKind || !subjectRef || !action || !ruleVersion) return refuse(400, "bad_body");
  if (reason.length < 8) return refuse(400, "reason_required");

  // THE BOOK GATE, re-run. The caller named a book; that name is only a request.
  const slugs = await entitledBookSlugs(user, token, deps.env, deps.fetch);
  if (slugs.length === 0) return refuse(403, "not_entitled");
  const ids = await bookIdsForSlugs(slugs, grant.tenantId, deps);
  if (!ids.includes(bookId)) {
    log(`decision_write_book_denied resource=${name}`);
    return refuse(403, "not_entitled");
  }

  // Identity and tenant are SERVER facts. Anything the caller sent for these is
  // ignored rather than merged.
  const row = {
    tenant_id: grant.tenantId,
    book_id: bookId,
    subject_kind: subjectKind,
    subject_ref: subjectRef,
    action,
    reason,
    rule_version: ruleVersion,
    decided_by: user.email ?? user.id ?? "unknown",
  };

  const headers: Record<string, string> = {
    apikey: deps.env.cubeKey,
    Authorization: `Bearer ${deps.env.cubeKey}`,
    "Content-Type": "application/json",
    Accept: "application/json",
    Prefer: "return=representation",
  };
  const schema = resource.schema ?? deps.env.cubeSchema;
  if (schema) {
    headers["Content-Profile"] = schema;
    headers["Accept-Profile"] = schema;
  }

  let res: Response;
  try {
    res = await deps.fetch(`${deps.env.cubeUrl}/rest/v1/${resource.table}`, {
      method: "POST",
      headers,
      body: JSON.stringify(row),
    });
  } catch {
    return refuse(502, "upstream_unreachable");
  }
  if (!res.ok) {
    log(`decision_write_upstream status=${res.status}`);
    return refuse(502, "upstream_error");
  }

  const rows = (await res.json().catch(() => null)) as Record<string, unknown>[] | null;
  const written = Array.isArray(rows) && rows[0] ? rows[0] : null;
  if (!written) return refuse(502, "upstream_error");

  // Re-check the row we got back, the same way reads are re-checked: a row that
  // came back under another tenant is a bug, and it is not returned.
  if (written.tenant_id !== grant.tenantId) {
    log("decision_write_tenant_mismatch");
    return refuse(502, "upstream_error");
  }

  return { status: 201, body: { row: written }, headers: JSON_HEADERS };
}
