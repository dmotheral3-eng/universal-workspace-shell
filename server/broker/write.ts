/**
 * The broker's general write door (BOR-130).
 *
 * SAME ORDER OF OPERATIONS AS A READ, AND FOR THE SAME REASON. Each step
 * refuses before the next can spend anything, and the Cube is not touched until
 * all of them have passed:
 *
 *   write allowlist → bearer present → master verifies it
 *                   → shell tables resolve a tenant → tenant may reach the door
 *                   → body is ONLY the keys and fields the allowlist names
 *                   → ONE call to the wall, which decides, writes and records
 *                   → the returned row re-checked against the tenant
 *
 * WHAT IS JUDGED WHERE. The broker establishes facts: who is calling (master
 * verified it), which tenant they are in (the shell's own table), what they
 * hold (their entitlements). It does not decide whether the change is allowed.
 * That is `lending.fn_broker_write` on the Cube, which runs the check, the
 * write and the evidence row inside one transaction — so a write and its
 * evidence cannot disagree, and a refusal leaves a record too. The rule lives
 * where the data is; this file only carries the facts to it.
 *
 * WHAT THE CALLER CANNOT SEND: an identity, a tenant, a table, a column, or a
 * field the allowlist does not name. An unknown field is a 400, not a field
 * that is quietly dropped — a caller who believes they changed something they
 * did not is worse off than one who is told no.
 *
 * A REFUSAL IS AN ANSWER, NOT A FAILURE. The wall says `{ok:false, code}`; that
 * comes back as a 403 carrying the wall's own code. A 502 is reserved for the
 * case where the wall could not be asked at all.
 *
 * A REFUSAL NAMES ITS RULE (BOR-132). The wall's codes are unchanged; the
 * broker maps each to the gate rule bound to this (resource, action) and
 * returns `{refused, rule_key, label, description, version}` from that rule's
 * own row — the same row the `can` route read before the click. A code with no
 * gate behind it (`write_not_allowed`, `not_found`, …) stays a bare code.
 */

import { meterAppAction } from "./meter.js";
import { lookupWrite, type BrokerWrite } from "./resources.js";
import { isEntitled, resolveTenant, verifyMasterSession } from "./identity.js";
import { gateForCode, loadGates, requiredEntitlement } from "./gates.js";
import {
  bearerFrom,
  refuse,
  resourceNameFromPath,
  type BrokerDeps,
  type BrokerRequest,
  type BrokerResponse,
} from "./handler.js";

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SLUG = /^[A-Za-z0-9_:-]{1,64}$/;
/** Free text is bounded, and may not carry control characters. */
const MAX_TEXT = 2_000;
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/;

/** A code the wall may return. Anything else is treated as an upstream fault. */
const WALL_CODE = /^[a-z][a-z0-9_]{1,63}$/;

const ACTIONS = new Set(["create", "update", "delete"]);

type Json = Record<string, unknown>;

function isObject(v: unknown): v is Json {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** The row's address, validated against the allowlist. Null means refuse. */
function readKey(write: BrokerWrite, raw: unknown): Record<string, string> | null {
  if (!isObject(raw)) return null;
  const names = Object.keys(write.key);
  if (Object.keys(raw).length !== names.length) return null;

  const out: Record<string, string> = {};
  for (const name of names) {
    const value = raw[name];
    if (typeof value !== "string") return null;
    const ok = write.key[name] === "uuid" ? UUID.test(value) : SLUG.test(value);
    if (!ok) return null;
    out[name] = value;
  }
  return out;
}

/** The fields to change, validated against the allowlist. Null means refuse. */
function readValues(write: BrokerWrite, raw: unknown): Record<string, string> | null {
  if (!isObject(raw)) return null;
  const entries = Object.entries(raw);
  if (entries.length === 0) return null;

  const out: Record<string, string> = {};
  for (const [name, value] of entries) {
    if (!Object.prototype.hasOwnProperty.call(write.fields, name)) return null;
    if (typeof value !== "string") return null;
    const rule = write.fields[name];
    if (rule === "text") {
      if (value.length > MAX_TEXT || CONTROL.test(value)) return null;
    } else if (!rule.includes(value)) {
      return null;
    }
    out[name] = value;
  }
  return out;
}

export async function handleWrite(req: BrokerRequest, deps: BrokerDeps): Promise<BrokerResponse> {
  const log = deps.log ?? (() => undefined);
  const url = new URL(req.url);

  // 1. Allowlist before authentication, exactly as reads do: an unlisted
  //    resource is a 404 for everyone, so the write surface cannot be mapped
  //    with a valid session either.
  const name = resourceNameFromPath(url.pathname);
  const write = name ? lookupWrite(name) : null;
  if (!name || !write) return refuse(404, "unknown_resource");

  // 2–4. Identity and tenant: the same three steps, the same refusals.
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

  // 5. May this tenant reach the door at all. This is the READ entitlement —
  //    someone who cannot see the checklist has no business learning what the
  //    wall would say about changing it.
  if (!isEntitled(grant, write.entitlement)) return refuse(403, "not_entitled");

  // 6. The body. Shape only; nothing here is a judgement about the change.
  if (typeof req.json !== "function") return refuse(400, "bad_body");
  let body: Json;
  try {
    const parsed = await req.json();
    if (!isObject(parsed)) return refuse(400, "bad_body");
    body = parsed;
  } catch {
    return refuse(400, "bad_body");
  }

  const action = typeof body.action === "string" && ACTIONS.has(body.action) ? body.action : "";
  if (!action) return refuse(400, "bad_body");
  if (!write.actions.includes(action as BrokerWrite["actions"][number])) {
    return refuse(405, "action_not_allowed");
  }

  const key = readKey(write, body.id);
  if (!key) return refuse(400, "bad_id");

  // A delete carries no fields; every other action must carry at least one.
  const values = action === "delete" ? {} : readValues(write, body.values);
  if (!values) return refuse(400, "bad_field");

  // 6b. THE GATES bound to this action, read from the rule rows. The wall is
  //     asked to require the role gate's own entitlement — so what it refuses
  //     on and what the refusal cites cannot be two different things. If the
  //     rows cannot be read the wall is not asked at all: a write judged
  //     against a rule nobody could read is not one this door lets through.
  const gates = await loadGates(write.gates[action as BrokerWrite["actions"][number]] ?? [], grant.tenantId, deps);
  const required = gates ? requiredEntitlement(gates) : null;
  if (!gates || !required) {
    log(`write_gate_unreadable resource=${name}`);
    return refuse(502, "upstream_error");
  }

  // An actor with no verified email is recorded by id rather than as "unknown":
  // the evidence row names whoever master said this was, or it names nobody.
  const actor = user.email ?? user.id;

  // 7. The one call. Tenant, actor and entitlements are SERVER facts — whatever
  //    the caller sent under those names was never read.
  let res: Response;
  try {
    res = await deps.fetch(`${deps.env.cubeUrl}/rest/v1/rpc/fn_broker_write`, {
      method: "POST",
      headers: {
        apikey: deps.env.cubeKey,
        Authorization: `Bearer ${deps.env.cubeKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "Content-Profile": "lending",
        "Accept-Profile": "lending",
      },
      body: JSON.stringify({
        p_tenant: grant.tenantId,
        p_actor: actor,
        p_entitlements: grant.entitlements,
        p_required: required,
        p_resource: name,
        p_action: action,
        p_id: key,
        p_values: values,
      }),
    });
  } catch {
    log(`write_unreachable resource=${name}`);
    return refuse(502, "upstream_unavailable");
  }

  if (!res.ok) {
    // Status only. The upstream body can name schemas, columns and hostnames.
    log(`write_upstream resource=${name} status=${res.status}`);
    return refuse(502, "upstream_error");
  }

  const verdict = (await res.json().catch(() => null)) as Json | null;
  if (!isObject(verdict) || typeof verdict.ok !== "boolean") {
    log(`write_shape resource=${name}`);
    return refuse(502, "upstream_error");
  }

  // 8. THE WALL SAID NO. Its code, verbatim — provided it looks like a code. A
  //    refusal is not metered: an action that was refused is not one the
  //    customer took.
  if (!verdict.ok) {
    const code = typeof verdict.code === "string" && WALL_CODE.test(verdict.code) ? verdict.code : null;
    if (!code) {
      log(`write_refusal_shape resource=${name}`);
      return refuse(502, "upstream_error");
    }
    log(`write_refused resource=${name} code=${code}`);
    const refusal: Json = { ok: false, error: code };
    const rule = gateForCode(gates, code);
    if (rule) {
      refusal.refused = true;
      refusal.rule_key = rule.ruleKey;
      refusal.version = rule.version;
      refusal.label = rule.label;
      refusal.description = rule.description;
    }
    if (typeof verdict.change_id === "string") refusal.change_id = verdict.change_id;
    return { status: 403, body: refusal, headers: JSON_HEADERS };
  }

  const row = isObject(verdict.row) ? verdict.row : null;
  if (!row) {
    log(`write_row_missing resource=${name}`);
    return refuse(502, "upstream_error");
  }

  // 9. Re-check the row on the way out, as reads and the decision write do. A
  //    row under another tenant is a bug in the wall, and it does not leave.
  if (String(row[write.tenantColumn]) !== grant.tenantId) {
    log(`write_tenant_mismatch resource=${name}`);
    return refuse(502, "upstream_error");
  }

  await meterAppAction(
    {
      tenantId: grant.tenantId,
      surface: "/api/cube",
      handler: "handleWrite",
      method: "POST",
      resource: name,
      refId: Object.values(key).join("/"),
      evidence: `brokered ${action} on ${name} (${Object.keys(values).join(",") || "no fields"})`,
    },
    deps
  );

  const ok: Json = { ok: true, row };
  if (typeof verdict.change_id === "string") ok.change_id = verdict.change_id;
  return { status: 200, body: ok, headers: JSON_HEADERS };
}
