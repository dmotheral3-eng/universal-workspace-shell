/**
 * The app-boundary meter (BOR-70).
 *
 * WHY THIS FILE IS THIN ON PURPOSE. Every judgement about what an action is
 * worth — which priced key it maps to, whether that mapping is ruled, whether
 * the tenant may be charged at all — lives on the Cube in
 * `lending.fn_meter_app_action`, `lending.interaction_action_map` and
 * `public.fn_meter_consume`. Dave re-rules a mapping with an UPDATE; this repo
 * does not redeploy for a pricing change and does not hold a copy of the price
 * list (law no-hardcoding). All this module does is name the handler truthfully
 * and hand it over.
 *
 * IT COUNTS; IT DOES NOT BILL. While a mapping row is DRAFT, the Cube function
 * calls fn_meter_consume with verified=false — that function's own
 * consume-on-verified-success path — so the act is recorded at zero credits
 * with the reason it was not charged. That is this ticket's title honoured
 * literally: count what $0.12 bills, before anything bills it.
 *
 * A METERING FAILURE MUST NEVER BECOME A USER-FACING FAILURE. The caller asked
 * for their rows, not for our accounting. Everything here is wrapped: a
 * refusal, a timeout or an upstream outage is logged by code and swallowed. The
 * one thing it will not do is pretend — an unmapped handler comes back as
 * `unmapped_handler` and is logged as a meter gap, never silently ignored,
 * because a meter that quietly counts nothing is the defect BOR-66 was filed
 * about.
 */

import type { BrokerEnv } from "./env.js";
import type { FetchLike } from "./identity.js";

/** Bounded so a slow meter cannot hold a user's response open. */
const METER_TIMEOUT_MS = 2_000;

export interface MeterAction {
  tenantId: string;
  /** Route the action arrived on, e.g. "/api/cube". */
  surface: string;
  /** The exported handler's own name — never a label invented here. */
  handler: string;
  method: string;
  /** Broker resource name, when the action names one. */
  resource?: string | null;
  /** What the action touched, for the audit trail. */
  refId?: string | null;
  evidence?: string | null;
}

export interface MeterDeps {
  env: BrokerEnv;
  fetch: FetchLike;
  log?: (message: string) => void;
}

/**
 * Record one server-side action against the meter. Resolves to the Cube's own
 * verdict when it got one, or null when metering could not happen — callers
 * ignore the value; it is returned for the tests.
 */
export async function meterAppAction(
  action: MeterAction,
  deps: MeterDeps
): Promise<Record<string, unknown> | null> {
  const log = deps.log ?? (() => undefined);

  if (!action.tenantId) {
    log("meter_skipped reason=tenant_unresolved");
    return null;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), METER_TIMEOUT_MS);

  try {
    const res = await deps.fetch(`${deps.env.cubeUrl}/rest/v1/rpc/fn_meter_app_action`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        apikey: deps.env.cubeKey,
        Authorization: `Bearer ${deps.env.cubeKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        // The function lives in the lending schema.
        "Content-Profile": "lending",
        "Accept-Profile": "lending",
      },
      body: JSON.stringify({
        p_tenant: action.tenantId,
        p_surface: action.surface,
        p_handler: action.handler,
        p_method: action.method.toUpperCase(),
        p_resource: action.resource ?? null,
        p_ref_id: action.refId ?? null,
        p_evidence: action.evidence ?? null,
      }),
    });

    if (!res.ok) {
      // Status only — the upstream body can name schemas and hosts (P#183).
      log(`meter_upstream status=${res.status} handler=${action.handler}`);
      return null;
    }

    const verdict = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!verdict) return null;

    // A gap is reported by name. This is the whole point of the exercise: the
    // light's denominator can only be honest if the doors say when they miss.
    if (verdict.reason === "unmapped_handler") {
      log(
        `meter_gap unmapped_handler surface=${action.surface} handler=${action.handler} ` +
          `method=${action.method.toUpperCase()} resource=${action.resource ?? "-"}`
      );
    } else if (verdict.reason === "unruled_action") {
      log(`meter_unruled handler=${action.handler} resource=${action.resource ?? "-"}`);
    }

    return verdict;
  } catch (e) {
    const why = e instanceof Error && e.name === "AbortError" ? "timeout" : "unreachable";
    log(`meter_failed reason=${why} handler=${action.handler}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
