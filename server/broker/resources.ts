/**
 * The brokered read surface — an ALLOWLIST, not a proxy.
 *
 * `/api/cube/<resource>` can only reach a table named here, can only select the
 * columns named here, and can only be narrowed by the filters named here. A
 * request for anything else is a 404 before a single upstream call is made.
 * That is the difference between a broker and an open PostgREST tunnel: the
 * browser never gets to choose a table, a column, or an operator.
 *
 * Every resource declares its tenant column. The broker applies that filter on
 * every call and re-checks it on every returned row; a resource with no honest
 * tenant column does not belong on this surface.
 */

export interface BrokerResource {
  /** Physical table on the Cube. */
  table: string;
  /** PostgREST profile (`Accept-Profile`). Null means the default schema. */
  schema: string | null;
  /** The column the broker scopes on. Mandatory — there is no unscoped resource. */
  tenantColumn: string;
  /** Explicit select list. No `*`: a column added upstream must be opted into here. */
  columns: string[];
  /** Entitlement key the caller's shell membership must carry. */
  entitlement: string;
  /** Client-supplied narrowing, allowlisted by name → column. */
  filters: Record<string, string>;
  /** PostgREST order clause, fixed server-side. */
  order: string | null;
  /** Hard ceiling on rows, whatever the caller asks for. */
  maxLimit: number;
}

export const BROKER_RESOURCES: Record<string, BrokerResource> = {
  /**
   * PROOF SURFACE — the Rates panel (`src/panels/legal/rates.tsx`).
   *
   * Chosen because the rate card is genuinely tenant-level: it carries no
   * case_id (see docs/KNOWN_GAPS.md), so tenant scoping is the *only* thing
   * standing between one workspace's rates and another's. If the broker's
   * scoping is wrong, this panel is where it shows.
   */
  rate_card: {
    table: "ld_rate_card",
    schema: "legal",
    tenantColumn: "tenant_id",
    columns: ["id", "tenant_id", "role", "hourly_rate", "locale", "basis"],
    entitlement: "legal.rates",
    filters: {},
    order: "role.asc",
    maxLimit: 500,
  },
};

export function lookupResource(name: string): BrokerResource | null {
  // Own-property lookup only: "constructor"/"__proto__" must not resolve.
  return Object.prototype.hasOwnProperty.call(BROKER_RESOURCES, name)
    ? BROKER_RESOURCES[name]
    : null;
}
