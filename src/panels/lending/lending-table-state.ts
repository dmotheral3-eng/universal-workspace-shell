import { NO_BOOK_ACCESS_MESSAGE, isRefusalCode } from "@/shell/door-email-claim";
import type { LegalDataState } from "@/panels/legal/use-legal-data";
import type { Row } from "@/data/lending-broker";

/**
 * What a table query currently says, reduced to the facts the frame needs.
 * Kept apart from the hook so the mapping from "what the query did" to "what
 * the panel shows" can be tested without a browser.
 */
export interface TableFacts {
  /** This build has a brokered door at all. */
  brokered: boolean;
  /** The panel needs a book, and one is open. */
  bookReady: boolean;
  /** The query has not answered yet. */
  loading: boolean;
  /** The code the query failed with, if it failed. */
  errorCode: unknown;
  /** The data provider's own "the answer was no" marker (see refine-data-provider.ts). */
  refused: unknown;
  /** Rows as the broker returned them. */
  rows: Row[] | undefined;
}

/**
 * The same five outcomes `useLendingData` produced, in the same order of
 * precedence, so a panel that swaps hooks renders exactly what it rendered
 * before in every non-ready case:
 *
 *   not brokered        → unavailable   (no second data path, ever)
 *   no book open        → awaiting-entity
 *   not answered yet    → loading
 *   answered "no"       → refused       (a correct reading, not a failure)
 *   failed              → error
 *   answered            → ready, rows mapped by the SAME mapper `list*` uses
 */
export function lendingTableState<T>(facts: TableFacts, map: (row: Row) => T): LegalDataState<T[]> {
  if (!facts.brokered) return { kind: "unavailable" };
  if (!facts.bookReady) return { kind: "awaiting-entity" };
  if (facts.loading) return { kind: "loading" };
  if (isRefusalCode(facts.refused) || isRefusalCode(facts.errorCode)) {
    return { kind: "refused", message: NO_BOOK_ACCESS_MESSAGE };
  }
  if (facts.errorCode !== undefined && facts.errorCode !== null) return { kind: "error" };
  if (!facts.rows) return { kind: "loading" };
  return { kind: "ready", data: facts.rows.map((r) => map(r)) };
}
