import { useEffect, useState } from "react";
import { useTable } from "@refinedev/core";
import type { HttpError } from "@refinedev/core";
import { bus } from "@/bus";
import { usePanelScope } from "@/shell/panel-scope";
import { isBrokerMode } from "@/data/cube-broker";
import type { Row } from "@/data/lending-broker";
import type { LegalDataState } from "@/panels/legal/use-legal-data";
import { lendingTableState } from "./lending-table-state";

/**
 * The lending panels' data line, on a resource (BOR-136).
 *
 * Replaces `useLendingData` for every panel that lists rows. The panel names a
 * brokered resource and the mapper for its rows; this asks for the list through
 * the one data provider (`useTable` → `refine-data-provider.ts` → the broker),
 * narrowed to whichever book is open, and returns the same state shape the
 * frame already renders. Nothing about what the panel draws changes.
 *
 * ONE DOOR ONLY, as before. On a build that is not brokered the query is never
 * enabled and the panel shows the quiet `unavailable` line.
 *
 * WHY `useTable` AND NOT `useList`. A panel narrowed to a book is a filtered
 * view, and the registry ruling is that filtered views go through the table
 * hook. Books — the unfiltered entity list — uses it too, so there is one way.
 *
 * Paging is off: the broker returns a ceiling-bounded set and these panels show
 * all of it, exactly as they did. The URL is the shell's, so nothing syncs.
 */
export function useLendingTable<T>(
  resource: string,
  map: (row: Row) => T,
  options?: { requiresBook?: boolean }
): { state: LegalDataState<T[]>; bookName: string | null } {
  const requiresBook = options?.requiresBook ?? true;
  const { tab } = usePanelScope();
  const scopeId = tab.scopeId ?? null;

  const [bookId, setBookId] = useState<string | null>(null);
  const [bookName, setBookName] = useState<string | null>(null);

  useEffect(() => {
    setBookId(null);
    setBookName(null);
    // The Books panel is the entity list of this surface, so it speaks the same
    // event every other entity list does.
    return bus.onScoped("entity.selected", scopeId, (event) => {
      setBookId(event.entityId);
      setBookName(event.entityName);
    });
  }, [scopeId]);

  const brokered = isBrokerMode();
  const bookReady = !requiresBook || Boolean(bookId);

  const { tableQuery } = useTable<Row, HttpError & { code?: unknown }>({
    resource,
    meta: requiresBook && bookId ? { book_id: bookId } : undefined,
    pagination: { mode: "off" },
    syncWithLocation: false,
    queryOptions: {
      enabled: brokered && bookReady,
      // A refusal or a failure is shown as what it is; asking again three more
      // times only delays the sentence the frame is about to render.
      retry: false,
    },
  });

  const failure = tableQuery.error;
  useEffect(() => {
    // Detail to the console only: a broker code can name a resource.
    if (failure) console.warn("[lending panel] load failed", failure);
  }, [failure]);

  const state = lendingTableState<T>(
    {
      brokered,
      bookReady,
      loading: tableQuery.isLoading,
      errorCode: tableQuery.error ? (tableQuery.error as { code?: unknown }).code ?? "unknown" : undefined,
      refused: (tableQuery.data as { meta?: { refused?: unknown } } | undefined)?.meta?.refused,
      rows: tableQuery.data?.data,
    },
    map
  );

  return { state, bookName };
}
