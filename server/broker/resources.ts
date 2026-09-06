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
  /**
   * Narrow further, to the BOOKS this caller is entitled to.
   *
   * Tenant scoping alone is not enough on the lending surface: one tenant can
   * hold several books and an entitlement is granted per book, not per tenant.
   * A resource that sets this is additionally constrained to the book list
   * master returns for the caller — see `entitledBookSlugs` in ./identity.
   *
   *   "slug"     the books table itself, narrowed on its own slug column
   *   "book_id"  an evidence table, narrowed on the ids those slugs resolve to
   */
  bookScope?: "slug" | "book_id";
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

/* -------------------------------------------------------------- lending ---
 * The lending surface (VITE_PROFILE=lending-app). Five resources, one book
 * spine and four evidence tables, all on the Cube under schema `lending`.
 *
 * Every one carries BOTH gates: `tenantColumn` as usual, and `bookScope`,
 * because a lending tenant can hold more than one book and access is granted a
 * book at a time. The isolation control is real and lives in the data —
 * specimen-first-light and specimen-second-lender sit under DIFFERENT tenant
 * ids, so a scoping mistake shows up as the wrong book, not as a subtle
 * column error.
 */
const LENDING_ENTITLEMENT = "lending.evidence";

Object.assign(BROKER_RESOURCES, {
  lending_books: {
    table: "books",
    schema: "lending",
    tenantColumn: "tenant_id",
    columns: ["id", "tenant_id", "slug", "display_name", "tribe_label", "is_specimen", "status"],
    entitlement: "lending.books",
    filters: {},
    order: "display_name.asc",
    maxLimit: 200,
    bookScope: "slug",
  },
  lending_decisions: {
    table: "evidence_decisions",
    schema: "lending",
    tenantColumn: "tenant_id",
    columns: [
      "id", "tenant_id", "book_id", "decision_ref", "decided_at", "outcome",
      "model_version", "reviewer", "reviewed_at", "review_action", "retention_until",
      "corrects_id", "recorded_at",
    ],
    entitlement: LENDING_ENTITLEMENT,
    filters: { book: "book_id" },
    order: "decided_at.desc",
    maxLimit: 500,
    bookScope: "book_id",
  },
  lending_interactions: {
    table: "evidence_interactions",
    schema: "lending",
    tenantColumn: "tenant_id",
    columns: [
      "id", "tenant_id", "book_id", "channel", "occurred_at", "agent_ref",
      "policy_version", "flagged", "flag_rule", "disposition", "corrects_id", "recorded_at",
    ],
    entitlement: LENDING_ENTITLEMENT,
    filters: { book: "book_id" },
    order: "occurred_at.desc",
    maxLimit: 500,
    bookScope: "book_id",
  },
  lending_changes: {
    table: "evidence_changes",
    schema: "lending",
    tenantColumn: "tenant_id",
    columns: [
      "id", "tenant_id", "book_id", "path", "intent", "author", "author_kind",
      "reasoning", "status", "corrects_id", "recorded_at",
    ],
    entitlement: LENDING_ENTITLEMENT,
    filters: { book: "book_id" },
    order: "recorded_at.desc",
    maxLimit: 500,
    bookScope: "book_id",
  },
  /**
   * THE NAV, AS ROWS. The app refuses to hardcode its own list surfaces, so this
   * resource is what makes "a new list is a registry row" true at runtime.
   *
   * It is tenant-scoped like everything else here, and that is not a formality:
   * which surfaces a book's operator sees is a per-book fact, and the broker's
   * own rule is that a resource with no honest tenant column does not belong on
   * this surface. A nav is not an exception to that.
   */
  lending_view_registry: {
    table: "view_registry",
    schema: "lending",
    tenantColumn: "tenant_id",
    columns: ["id", "tenant_id", "view_key", "label", "resource", "sort_order", "active"],
    entitlement: LENDING_ENTITLEMENT,
    filters: {},
    order: "sort_order.asc",
    maxLimit: 100,
  },
  /**
   * The decision record, READ side. The write side is not here: it is the single
   * POST in ./handler, which is deliberately the only non-read on this surface.
   */
  lending_decision_log: {
    table: "decision_log",
    schema: "lending",
    tenantColumn: "tenant_id",
    columns: [
      "id", "tenant_id", "book_id", "subject_kind", "subject_ref", "action",
      "reason", "rule_version", "decided_by", "decided_at", "corrects_id",
    ],
    entitlement: LENDING_ENTITLEMENT,
    filters: { book: "book_id", subject_ref: "subject_ref" },
    order: "decided_at.desc",
    maxLimit: 200,
    bookScope: "book_id",
  },
  lending_attestations: {
    table: "evidence_attestations",
    schema: "lending",
    tenantColumn: "tenant_id",
    columns: [
      "id", "tenant_id", "book_id", "kind", "subject", "status",
      "effective_at", "expires_at", "corrects_id", "recorded_at",
    ],
    entitlement: LENDING_ENTITLEMENT,
    filters: { book: "book_id" },
    order: "effective_at.desc",
    maxLimit: 500,
    bookScope: "book_id",
  },
  /**
   * THIRD-PARTY RISK — the two vendor resources (D-BWVENDOR-1, BOR-29).
   *
   * TENANT-LEVEL, NOT BOOK-LEVEL, AND THAT IS THE HONEST SHAPE. A vendor is a
   * counterparty the whole tenant depends on; it carries no book column upstream,
   * and inventing one to satisfy the book gate would be faking a scope the data
   * does not have. They sit beside `lending_view_registry` as the named tenant-only
   * exceptions, and the test that enumerates the lending resources names them so a
   * third cannot be added quietly.
   *
   * `schema: null` — unlike every other lending resource these are PUBLIC views on
   * the Cube (bw_v_*), not objects in the `lending` schema. Verified live before
   * this entry was written: both exist, both are readable, 7 and 42 rows.
   */
  lending_vendors: {
    table: "bw_v_vendor_book",
    schema: null,
    tenantColumn: "tenant_id",
    columns: ["tenant_id", "vendor_id", "name", "tier", "amount", "done", "total", "status"],
    entitlement: LENDING_ENTITLEMENT,
    filters: {},
    order: "name.asc",
    maxLimit: 200,
  },
  lending_vendor_checklist: {
    table: "bw_v_vendor_checklist",
    schema: null,
    tenantColumn: "tenant_id",
    columns: ["tenant_id", "vendor_id", "title", "status", "sealed", "detail", "fact_key", "recorded_at"],
    entitlement: LENDING_ENTITLEMENT,
    // One narrowing only, by name. `vendor` is the sole key a caller may send;
    // anything else is refused by the handler rather than ignored.
    filters: { vendor: "vendor_id" },
    order: "recorded_at.asc",
    maxLimit: 500,
  },
} satisfies Record<string, BrokerResource>);

export function lookupResource(name: string): BrokerResource | null {
  // Own-property lookup only: "constructor"/"__proto__" must not resolve.
  return Object.prototype.hasOwnProperty.call(BROKER_RESOURCES, name)
    ? BROKER_RESOURCES[name]
    : null;
}
