/**
 * `GET /api/cube/can?resource=…&action=…[&id=…]` — may I, and if not, why (BOR-132).
 *
 * THE GAP THIS CLOSES. A refused write comes back as a code, by design: the
 * browser never sees upstream detail. But a screen that hides a control owes
 * the person a reason, and a reason cannot come from an error that has not
 * happened yet. So the reason is a READ — of the rule row that would refuse.
 *
 * THE REASON IS THE RULE'S OWN TEXT. `reason` is `label` + `description` from
 * `obligation.obligation_rules`, through the same loader the write door uses
 * when the wall refuses. So the rule_key named here before the click is the
 * rule_key an attempted write comes back with, and the wording a compliance
 * officer reads in the rules table is the wording on the screen.
 *
 * THE ANSWER HAS THE BROKER'S ROW SHAPE — `{resource, tenant, rows: [verdict]}`
 * with exactly one row — so the client reads it through `brokerGet`, the one
 * read door it already has, rather than through a second fetch path:
 *
 *   { can: true }
 *   { can: false, reason, rule_key, version, label, description }
 *   { can: false }        refused with no rule to cite (see below)
 *
 * WHAT GETS A BARE `can:false`. An action the write allowlist does not open, a
 * resource this surface does not know, a caller who cannot even read the
 * resource, a step that does not exist, a gate whose row could not be read.
 * None of those is a rule refusing; inventing a reason for them would be the
 * screen making up policy. Someone who cannot see the checklist also has no
 * business learning what the wall would say about changing it.
 *
 * READS (`list`, `show`) are answered from the read allowlist's entitlement —
 * the same check the read itself is about to make.
 *
 * NOT METERED: asking whether you may is not an action a customer took.
 */

import { lookupResource, lookupWrite, type BrokerResource, type BrokerWrite } from "./resources.js";
import { isEntitled, resolveTenant, verifyMasterSession } from "./identity.js";
import { evaluateGates, loadGates, reasonOf } from "./gates.js";
import { bearerFrom, refuse, type BrokerDeps, type BrokerRequest, type BrokerResponse } from "./handler.js";

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  // Per-user and per-row. Must never sit in a shared cache.
  "cache-control": "no-store",
};

const NAME = /^[a-z][a-z0-9_]{1,63}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SLUG = /^[A-Za-z0-9_-]{1,64}$/;

/** Refine says `edit`; the write allowlist says `update`. Same act. */
const WRITE_ACTION: Record<string, "create" | "update" | "delete"> = {
  create: "create",
  edit: "update",
  update: "update",
  delete: "delete",
};
const READ_ACTIONS = new Set(["list", "show"]);

type Verdict = Record<string, unknown>;

/**
 * `<a>:<b>` → the row address, by the write allowlist's key names in order.
 * Null when the id does not have exactly that many parts or a part is not the
 * shape its key demands.
 */
function readKey(write: BrokerWrite, id: string): Record<string, string> | null {
  const names = Object.keys(write.key);
  const parts = id.split(":");
  if (parts.length !== names.length) return null;
  const out: Record<string, string> = {};
  for (let i = 0; i < names.length; i++) {
    const ok = write.key[names[i]] === "uuid" ? UUID.test(parts[i]) : SLUG.test(parts[i]);
    if (!ok) return null;
    out[names[i]] = parts[i];
  }
  return out;
}

/**
 * Is this step sealed — read from the resource's own view, under the tenant.
 * `undefined` means the step could not be read or does not exist.
 */
async function readSealed(
  resource: BrokerResource,
  key: Record<string, string>,
  tenantId: string,
  deps: BrokerDeps
): Promise<boolean | undefined> {
  if (!resource.columns.includes("sealed")) return undefined;

  const params = new URLSearchParams();
  params.set("select", [resource.tenantColumn, "sealed"].join(","));
  params.set(resource.tenantColumn, `eq.${tenantId}`);
  for (const [column, value] of Object.entries(key)) {
    if (!resource.columns.includes(column)) return undefined;
    params.set(column, `eq.${value}`);
  }
  params.set("limit", "1");

  const headers: Record<string, string> = {
    apikey: deps.env.cubeKey,
    Authorization: `Bearer ${deps.env.cubeKey}`,
    Accept: "application/json",
  };
  const schema = resource.schema ?? deps.env.cubeSchema;
  if (schema) headers["Accept-Profile"] = schema;

  let res: Response;
  try {
    res = await deps.fetch(`${deps.env.cubeUrl}/rest/v1/${resource.table}?${params.toString()}`, { headers });
  } catch {
    return undefined;
  }
  if (!res.ok) return undefined;

  const rows = (await res.json().catch(() => null)) as Array<Record<string, unknown>> | null;
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row || String(row[resource.tenantColumn]) !== tenantId) return undefined;
  return row.sealed === true;
}

export async function handleCan(req: BrokerRequest, deps: BrokerDeps): Promise<BrokerResponse> {
  const log = deps.log ?? (() => undefined);
  const url = new URL(req.url);

  // Shape first, before anything upstream is contacted.
  const target = url.searchParams.get("resource") ?? "";
  const action = url.searchParams.get("action") ?? "";
  const id = url.searchParams.get("id") ?? "";
  if (!NAME.test(target) || !NAME.test(action)) return refuse(400, "bad_filter");

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

  const answer = (verdict: Verdict): BrokerResponse => ({
    status: 200,
    body: { resource: "can", tenant: grant.tenantId, rows: [verdict] },
    headers: JSON_HEADERS,
  });
  const no = answer({ can: false });

  const resource = lookupResource(target);

  // A read: the read allowlist's own entitlement, nothing more.
  if (READ_ACTIONS.has(action)) {
    return answer({ can: resource !== null && isEntitled(grant, resource.entitlement) });
  }

  // A write: only what the write allowlist opens, and only for someone who may
  // reach that door at all.
  const verb = WRITE_ACTION[action];
  const write = lookupWrite(target);
  if (!verb || !write || !write.actions.includes(verb)) return no;
  if (!isEntitled(grant, write.entitlement)) return no;

  const bound = write.gates[verb];
  if (!bound || bound.length === 0) return no;

  const gates = await loadGates(bound, grant.tenantId, deps);
  if (!gates) {
    log(`can_gate_unreadable resource=${target}`);
    return no;
  }

  // The row's own state, when a row was asked about.
  let sealed: boolean | null = null;
  if (id !== "") {
    const key = readKey(write, id);
    if (!key || !resource) return refuse(400, "bad_filter");
    const state = await readSealed(resource, key, grant.tenantId, deps);
    if (state === undefined) return no;
    sealed = state;
  }

  const verdict = evaluateGates(gates, grant, sealed);
  if (verdict.can) return answer({ can: true });
  if (!verdict.rule) {
    log(`can_gate_unevaluable resource=${target}`);
    return no;
  }
  return answer({
    can: false,
    reason: reasonOf(verdict.rule),
    rule_key: verdict.rule.ruleKey,
    version: verdict.rule.version,
    label: verdict.rule.label,
    description: verdict.rule.description,
  });
}
