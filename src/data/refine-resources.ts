/**
 * Refine's resource list, READ FROM THE REGISTRY — never written down here.
 *
 * `lending.view_registry` already decides which list surfaces a tenant sees;
 * `server/broker/resources.ts` already exposes it as `lending_view_registry`,
 * tenant-scoped like everything else on that surface. So the resource list is
 * a QUERY, not a constant, and adding a surface stays what it already was: one
 * row, no code change, no deploy (law no-hardcoding).
 *
 * The registry is fetched rather than bundled because it is per-tenant: two
 * operators signed into the same build can honestly see different rails.
 */

import type { IResourceItem } from "@refinedev/core";
import { brokerGet, isBrokerMode } from "./cube-broker";

/** Exactly the columns `lending_view_registry` is allowed to return. */
interface ViewRegistryRow {
  id: string;
  tenant_id: string;
  view_key: string;
  label: string;
  resource: string;
  sort_order: number;
  active: boolean;
}

/**
 * The registry rows as Refine resources.
 *
 * WHY EVERY FAILURE HERE RETURNS `[]` RATHER THAN THROWING. This runs at app
 * root, above the gate, on every profile — including the ones with no lending
 * surface and no entitlement to that resource. A profile that legitimately has
 * no registry must render exactly as it did before Refine existed, so "no rows"
 * and "not my surface" both mean an empty resource list, not a broken shell.
 *
 * That tolerance is scoped to THIS call and does not travel: a refusal on a
 * panel's own data is still an answer the panel has to show (see
 * `use-lending-data.ts`). Swallowing here, surfacing there, is deliberate.
 */
export async function loadResourcesFromRegistry(): Promise<IResourceItem[]> {
  // Not the brokered profile at all — nothing to ask, and asking would only
  // produce a 404 on a door this build does not own.
  if (!isBrokerMode()) return [];

  let rows: ViewRegistryRow[];
  try {
    rows = await brokerGet<ViewRegistryRow>("lending_view_registry");
  } catch (e) {
    // Codes only, same as every other broker caller.
    const code = (e as { code?: string })?.code ?? "unknown";
    // Signed-out is the ordinary state of the sign-in screen — every load would
    // warn, and a warning that fires on the happy path trains people to ignore
    // the log. Anything else here is genuinely worth seeing.
    if (code !== "not_authenticated") {
      console.warn("view_registry unavailable", code);
    }
    return [];
  }

  return rows
    .filter((r) => r.active)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((r) => ({
      name: r.view_key,
      list: `/${r.view_key}`,
      meta: {
        label: r.label,
        // The BROKER resource this view reads through — `view_key` is the
        // rail's name for the surface, `resource` is the door it knocks on,
        // and they are not always the same string.
        resource: r.resource,
      },
    }));
}
