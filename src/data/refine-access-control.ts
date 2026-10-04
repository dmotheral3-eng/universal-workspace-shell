/**
 * Refine's access control provider, over the broker's `can` route (BOR-132).
 *
 * THIS FILE DECIDES NOTHING. `can({resource, action, params})` asks the server
 * and returns what it said. The browser holds no role list to consult and no
 * rule text to show: who holds what is the shell's membership table, which
 * rule governs an action is the broker's write allowlist, and what the rule
 * SAYS is its row in the rules table on the Cube. A reason composed here would
 * be a second wording, and the two could drift.
 *
 * WHAT COMES BACK. `{can: true}`, or `{can: false, reason, rule_key, version}`
 * where `reason` is the rule's own label and description. `rule_key` is the
 * same key an attempted write is refused with, so a screen can say which rule
 * it was and the record can be checked against it.
 *
 * THE ID. A row with a compound address is named `<a>:<b>` in the order the
 * server's allowlist lists its key — a vendor checklist step is
 * `<vendor_id>:<fact_key>`. With no id the server answers for the action in
 * general (the role), which is the right question for a "new" button.
 *
 * A REFUSAL IS AN ANSWER; A FAILURE IS NOT. Signed out, no tenant, not
 * entitled: `{can: false}`, nothing to show. A timeout or an unreachable
 * broker THROWS — it must not be cached for the session as a "no", and a
 * control that is absent because the network blinked is a lie about policy.
 * `<CanAccess>` renders nothing while there is no answer, so the control stays
 * absent either way; only the cached verdict differs.
 *
 * CACHED FOR THE SESSION per (resource, action, id), by `queryOptions` below —
 * Refine keys the query on exactly those. A role is granted by an
 * administrator out of band, so a fresh answer is a fresh page load.
 */

import type { AccessControlProvider, CanReturnType } from "@refinedev/core";
import { brokerGet } from "./cube-broker";
import { isRefusalCode } from "@/shell/door-email-claim";

/** The one row the `can` route answers with. */
interface CanRow {
  can?: unknown;
  reason?: unknown;
  rule_key?: unknown;
  version?: unknown;
  label?: unknown;
  description?: unknown;
}

/** What `useCan` / `<CanAccess onUnauthorized>` receive, with the rule named. */
export type BrokerCan = CanReturnType & {
  rule_key?: string;
  version?: number;
  label?: string;
  description?: string;
};

/** Codes that mean "the answer is no", in addition to the shell's own list. */
const NO = new Set(["not_authenticated", "bad_filter"]);

export const brokerAccessControlProvider: AccessControlProvider = {
  can: async ({ resource, action, params }): Promise<BrokerCan> => {
    if (!resource) return { can: false };

    // The registry's rail name and the broker's resource are not always the
    // same string — the same `meta.resource` the data provider reads.
    const mapped = (params?.resource?.meta as { resource?: unknown } | undefined)?.resource;
    const query: Record<string, string> = {
      resource: typeof mapped === "string" && mapped ? mapped : resource,
      action,
    };
    if (params?.id !== undefined && params.id !== null && params.id !== "") query.id = String(params.id);

    let rows: CanRow[];
    try {
      rows = await brokerGet<CanRow>("can", query);
    } catch (e) {
      const code = (e as { code?: unknown } | null)?.code;
      if (isRefusalCode(code) || (typeof code === "string" && NO.has(code))) return { can: false };
      throw e;
    }

    const verdict = rows[0];
    if (!verdict || verdict.can !== true) {
      const out: BrokerCan = { can: false };
      if (verdict && typeof verdict.reason === "string") out.reason = verdict.reason;
      if (verdict && typeof verdict.rule_key === "string") out.rule_key = verdict.rule_key;
      if (verdict && typeof verdict.version === "number") out.version = verdict.version;
      if (verdict && typeof verdict.label === "string") out.label = verdict.label;
      if (verdict && typeof verdict.description === "string") out.description = verdict.description;
      return out;
    }
    return { can: true };
  },

  options: {
    buttons: { enableAccessControl: true, hideIfUnauthorized: true },
    queryOptions: { staleTime: Infinity, gcTime: Infinity, retry: false },
  },
};
