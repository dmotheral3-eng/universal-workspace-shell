import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * BOR-136's "identical rows" check, and the five non-ready outcomes.
 *
 * The panels used to call `list*(bookId)`; they now read through the data
 * provider's `getList` and map with `to*`. For each resource this drives BOTH
 * paths over the same brokered rows and requires the same result, so a panel
 * that swapped hooks shows what it showed before.
 */

const brokerGet = vi.fn();

class BrokerError extends Error {
  code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

vi.mock("@/data/cube-broker", () => ({ brokerGet, brokerPost: vi.fn(), BrokerError }));
vi.mock("./cube-broker", () => ({ brokerGet, brokerPost: vi.fn(), BrokerError }));

const broker = await import("@/data/lending-broker");
const { brokerDataProvider } = await import("@/data/refine-data-provider");
const { lendingTableState } = await import("./lending-table-state");
const { NO_BOOK_ACCESS_MESSAGE } = await import("@/shell/door-email-claim");

const BOOK = "4a7b0983-93ee-4d6d-bbf1-c7551c1f0a1c";

const FIXTURES: Record<string, Array<Record<string, unknown>>> = {
  lending_books: [
    { id: BOOK, tenant_id: "t", slug: "specimen-first-light", display_name: "First Light", tribe_label: null, is_specimen: true, status: "specimen" },
    { id: "b2", tenant_id: "t", slug: "no-name", display_name: "", tribe_label: "", is_specimen: false, status: null },
  ],
  lending_decisions: [
    { id: "d1", tenant_id: "t", book_id: BOOK, decision_ref: "AA-1", decided_at: "2026-09-01T00:00:00Z", outcome: "declined", model_version: "v4.2", reviewer: "r", reviewed_at: "2026-09-02T00:00:00Z", review_action: "confirmed", retention_until: "2031-09-01", corrects_id: null },
    { id: "d2", tenant_id: "t", book_id: BOOK, decision_ref: null, decided_at: null, outcome: null, model_version: null, reviewer: null, reviewed_at: null, review_action: null, retention_until: null, corrects_id: "d1" },
  ],
  lending_interactions: [
    { id: "i1", tenant_id: "t", book_id: BOOK, channel: "call", occurred_at: "2026-09-03T00:00:00Z", agent_ref: "a-7", policy_version: "p3", flagged: true, flag_rule: "contact-frequency", disposition: null, corrects_id: null },
    { id: "i2", tenant_id: "t", book_id: BOOK, channel: "sms", occurred_at: "2026-09-04T00:00:00Z", agent_ref: null, policy_version: null, flagged: false, flag_rule: null, disposition: "closed", corrects_id: null },
  ],
  lending_changes: [
    { id: "c1", tenant_id: "t", book_id: BOOK, path: "decision-rules/dti-ceiling", intent: "raise the ceiling", author: "specimen-author-2", author_kind: "human", reasoning: "quarterly review", status: "applied", corrects_id: null, recorded_at: "2026-09-05T00:00:00Z" },
    { id: "c2", tenant_id: "t", book_id: BOOK, path: null, intent: null, author: null, author_kind: null, reasoning: null, status: "refused", corrects_id: null, recorded_at: null },
  ],
  lending_attestations: [
    { id: "a1", tenant_id: "t", book_id: BOOK, kind: "training", subject: "rep-1", status: "current", effective_at: "2026-01-01", expires_at: "2027-01-01", corrects_id: null },
  ],
};

const CASES = [
  { resource: "lending_books", map: broker.toBook, list: () => broker.listBooks(), book: false },
  { resource: "lending_decisions", map: broker.toDecision, list: () => broker.listDecisions(BOOK), book: true },
  { resource: "lending_interactions", map: broker.toInteraction, list: () => broker.listInteractions(BOOK), book: true },
  { resource: "lending_changes", map: broker.toChange, list: () => broker.listChanges(BOOK), book: true },
  { resource: "lending_attestations", map: broker.toAttestation, list: () => broker.listAttestations(BOOK), book: true },
] as const;

beforeEach(() => {
  brokerGet.mockReset();
  brokerGet.mockImplementation(async (resource: string) => FIXTURES[resource]);
});

describe("each panel renders the rows it rendered before", () => {
  for (const c of CASES) {
    it(`${c.resource}: the table path and the old list path agree, row for row`, async () => {
      const before = await c.list();

      const res = await brokerDataProvider.getList({
        resource: c.resource,
        meta: c.book ? { book_id: BOOK } : undefined,
        pagination: { mode: "off" },
      });
      const state = lendingTableState(
        { brokered: true, bookReady: true, loading: false, errorCode: undefined, refused: undefined, rows: res.data },
        c.map as (r: Record<string, unknown>) => unknown
      );

      expect(state).toEqual({ kind: "ready", data: before });
      expect(before).toHaveLength(FIXTURES[c.resource].length);

      // Same question both times: the same resource, the same book narrowing.
      const [first, second] = brokerGet.mock.calls;
      expect(second[0]).toBe(first[0]);
      expect(second[1] ?? {}).toEqual(first[1] ?? {});
    });
  }
});

describe("the non-ready outcomes, in the old hook's order", () => {
  const ready = { brokered: true, bookReady: true, loading: false, errorCode: undefined, refused: undefined, rows: [] };
  const id = (r: Record<string, unknown>) => r;

  it("is unavailable off the brokered door, whatever else is true", () => {
    expect(lendingTableState({ ...ready, brokered: false, rows: [{ id: "x" }] }, id)).toEqual({ kind: "unavailable" });
  });

  it("waits for a book before it is loading", () => {
    expect(lendingTableState({ ...ready, bookReady: false, loading: true }, id)).toEqual({ kind: "awaiting-entity" });
  });

  it("is loading until the query answers", () => {
    expect(lendingTableState({ ...ready, loading: true, rows: undefined }, id)).toEqual({ kind: "loading" });
    expect(lendingTableState({ ...ready, rows: undefined }, id)).toEqual({ kind: "loading" });
  });

  it("shows a refusal as a refusal — from the provider's marker or from a thrown code", () => {
    const refused = { kind: "refused", message: NO_BOOK_ACCESS_MESSAGE };
    expect(lendingTableState({ ...ready, refused: "not_entitled" }, id)).toEqual(refused);
    expect(lendingTableState({ ...ready, errorCode: "tenant_unresolved", rows: undefined }, id)).toEqual(refused);
  });

  it("shows every other failure as an error, never as an empty table", () => {
    expect(lendingTableState({ ...ready, errorCode: "upstream_error", rows: undefined }, id)).toEqual({ kind: "error" });
    expect(lendingTableState({ ...ready, errorCode: "unknown", rows: [] }, id)).toEqual({ kind: "error" });
  });

  it("is ready with no rows when the answer is an empty list", () => {
    expect(lendingTableState(ready, id)).toEqual({ kind: "ready", data: [] });
  });
});
