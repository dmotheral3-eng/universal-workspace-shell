/**
 * Gates (BOR-132) — which rule refuses which action, and the words it refuses in.
 *
 * ONE WORDING, ONE PLACE. A gate is a row in `obligation.obligation_rules` on
 * the Cube (rule_key `bw-gate-…`). Its `label` and `description` are what a
 * person reads on a refusal and what a compliance officer reads in the rules
 * table — the same two columns, so the two cannot drift. Nothing in this repo
 * holds a copy of that text.
 *
 * WHAT IS HERE AND WHAT IS NOT. The BINDING — (resource, action) → rule_key[],
 * in order — is in the write allowlist (./resources.ts). The RULE — who owns
 * it, what kind of check it is, what it says — is the row. This file reads the
 * rows and answers two questions with them:
 *
 *   `evaluateGates`   would the wall refuse this, and under which rule?  (the
 *                     `can` route asks before the click)
 *   `gateForCode`     the wall DID refuse with this code — which rule was it?
 *                     (the write door asks after the click)
 *
 * Both read the same rows, so the rule_key the `can` route names is the one an
 * attempted write comes back with.
 *
 * `role_held` LIVES HERE, NOT ON THE CUBE. A member holds role X when their
 * entitlements contain `lending.role.` + lower(X). No mapping table: the key
 * IS the mapping, and it is derived from the rule row's own `owner_role`.
 *
 * EVERYTHING UNKNOWN FAILS CLOSED. A bound rule whose row cannot be read, a
 * condition kind this file does not know, a step that cannot be found: each is
 * "no", never "probably fine".
 */

import type { BrokerDeps } from "./handler.js";
import type { TenantGrant } from "./identity.js";

/** The view the gate rows are read through. Gate rows only; see db/cube. */
const GATE_VIEW = "bw_v_gate_rules";
const GATE_COLUMNS = ["tenant_id", "rule_key", "version", "label", "description", "owner_role", "condition"];

/** A rule_key is interpolated into `in.(…)`; anything outside this is not asked. */
const RULE_KEY = /^[a-z0-9][a-z0-9-]{1,63}$/;

export interface GateRule {
  ruleKey: string;
  version: number;
  label: string;
  description: string;
  ownerRole: string;
  /** `condition.kind` on the rule row: "sealed", "role", … */
  kind: string;
}

/** The entitlement key that means "holds this role". Case-folded, per the ruling. */
export function roleKey(ownerRole: string): string {
  return `lending.role.${ownerRole.toLowerCase()}`;
}

/** The wildcard counts, because the wall counts it — the two must not disagree. */
export function roleHeld(grant: TenantGrant, ownerRole: string): boolean {
  return grant.entitlements.includes("*") || grant.entitlements.includes(roleKey(ownerRole));
}

/** What a person reads: the rule's label, then its description. */
export function reasonOf(rule: GateRule): string {
  return [rule.label, rule.description].filter(Boolean).join(" ");
}

/**
 * The gate rows for these keys, IN THE ORDER GIVEN, under this tenant.
 *
 * Null when the rows could not be read or when any bound key has no row — a
 * binding that names a rule nobody can read is a broken gate, and the callers
 * treat it as one rather than skipping it.
 */
export async function loadGates(
  ruleKeys: readonly string[],
  tenantId: string,
  deps: BrokerDeps
): Promise<GateRule[] | null> {
  if (ruleKeys.length === 0) return [];
  if (!ruleKeys.every((k) => RULE_KEY.test(k))) return null;

  const params = new URLSearchParams();
  params.set("select", GATE_COLUMNS.join(","));
  params.set("tenant_id", `eq.${tenantId}`);
  params.set("rule_key", `in.(${ruleKeys.join(",")})`);
  params.set("limit", String(ruleKeys.length));

  let res: Response;
  try {
    res = await deps.fetch(`${deps.env.cubeUrl}/rest/v1/${GATE_VIEW}?${params.toString()}`, {
      headers: {
        apikey: deps.env.cubeKey,
        Authorization: `Bearer ${deps.env.cubeKey}`,
        Accept: "application/json",
        "Accept-Profile": "public",
      },
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;

  const rows = (await res.json().catch(() => null)) as Array<Record<string, unknown>> | null;
  if (!Array.isArray(rows)) return null;

  const byKey = new Map<string, GateRule>();
  for (const row of rows) {
    // Re-checked on the way out, as every brokered read is.
    if (String(row.tenant_id) !== tenantId) continue;
    const condition = row.condition;
    const kind =
      condition && typeof condition === "object" && typeof (condition as { kind?: unknown }).kind === "string"
        ? (condition as { kind: string }).kind
        : "";
    const version = Number(row.version);
    if (typeof row.rule_key !== "string" || !Number.isInteger(version)) continue;
    byKey.set(row.rule_key, {
      ruleKey: row.rule_key,
      version,
      label: typeof row.label === "string" ? row.label : "",
      description: typeof row.description === "string" ? row.description : "",
      ownerRole: typeof row.owner_role === "string" ? row.owner_role : "",
      kind,
    });
  }

  const ordered: GateRule[] = [];
  for (const key of ruleKeys) {
    const rule = byKey.get(key);
    if (!rule) return null;
    ordered.push(rule);
  }
  return ordered;
}

/** The wall's refusal code for each kind of gate. Codes are the wall's; kinds are the rule's. */
const CODE_FOR_KIND: Record<string, string> = {
  sealed: "step_sealed",
  role: "role_required",
};

/** The rule behind a code the wall returned, among the gates bound to that action. */
export function gateForCode(gates: readonly GateRule[], code: string): GateRule | null {
  return gates.find((g) => CODE_FOR_KIND[g.kind] === code) ?? null;
}

/** The one entitlement the wall is asked to require: the role gate's, from its own row. */
export function requiredEntitlement(gates: readonly GateRule[]): string | null {
  const role = gates.find((g) => g.kind === "role" && g.ownerRole !== "");
  return role ? roleKey(role.ownerRole) : null;
}

export type GateVerdict =
  | { can: true }
  /** Refused by a rule: the row says why. */
  | { can: false; rule: GateRule }
  /** Refused with no rule to cite — a gate this file cannot evaluate. */
  | { can: false; rule: null };

/**
 * Walk the gates in order; the first that refuses wins — the same order the
 * wall checks in, so the answer before the click is the answer after it.
 *
 * `sealed` is the row's own state, or null when no row was asked about (a
 * `can` with no id): a sealed gate is then skipped, because there is no step
 * for it to be about. It is NOT skipped when the step was asked about and
 * could not be found — the caller refuses that before calling here.
 */
export function evaluateGates(
  gates: readonly GateRule[],
  grant: TenantGrant,
  sealed: boolean | null
): GateVerdict {
  for (const gate of gates) {
    if (gate.kind === "sealed") {
      if (sealed === true) return { can: false, rule: gate };
    } else if (gate.kind === "role") {
      if (gate.ownerRole === "") return { can: false, rule: null };
      if (!roleHeld(grant, gate.ownerRole)) return { can: false, rule: gate };
    } else {
      return { can: false, rule: null };
    }
  }
  return { can: true };
}
