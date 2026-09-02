import { useEffect, useState } from "react";
import { bus } from "@/bus";
import { usePanelScope } from "@/shell/panel-scope";
import { isBrokerMode } from "@/data/cube-broker";
import { listBooks, type LendingBook } from "@/data/lending-broker";
import { NO_BOOK_ACCESS_MESSAGE, isRefusalCode } from "@/shell/door-email-claim";
import { LD, LdEmpty, LdNote, humanize } from "@/panels/legal/ld-kit";
import { LdPanelFrame, type LdExplainCopy } from "@/panels/legal/ld-panel-frame";
import type { LegalDataState } from "@/panels/legal/use-legal-data";

/**
 * THE BOOKS — the entity list of the lending surface.
 *
 * Ported in shape from the wealth book view: the unit on screen is MANY, one
 * row per book, and picking one narrows every evidence panel beside it. What is
 * NOT ported is the synthetic data and the standalone terminal styling — this
 * one renders in the shell's own kit and every row is a brokered read.
 *
 * The list is already the caller's own: the broker narrows it to the books
 * master says they hold, so this panel never has to decide what to hide.
 */
export function BooksView({
  books,
  selectedId,
  onSelect,
}: {
  books: LendingBook[];
  selectedId: string | null;
  onSelect: (book: LendingBook) => void;
}) {
  if (books.length === 0) {
    return <LdEmpty line="No books are open to you in this workspace." />;
  }

  return (
    <div>
      <LdNote>Pick a book — the evidence panels follow whichever one is open.</LdNote>
      <div className="flex flex-col">
        {books.map((b) => {
          const isSelected = b.id === selectedId;
          return (
            <button
              key={b.id}
              type="button"
              onClick={() => onSelect(b)}
              aria-current={isSelected ? "true" : undefined}
              className="border-b px-3 py-2.5 text-left transition-colors hover:bg-accent"
              style={{
                borderColor: LD.hairline,
                background: isSelected ? LD.wash : undefined,
              }}
            >
              <div className="text-[13px] font-medium">{b.displayName}</div>
              <div className="mt-0.5 flex items-center gap-2 text-[11px]" style={{ color: LD.inkMuted }}>
                <span>{humanize(b.status) || "—"}</span>
                {b.tribeLabel && <span>· {b.tribeLabel}</span>}
                {b.isSpecimen && <span>· specimen</span>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export const BOOKS_EXPLAIN: LdExplainCopy = {
  what: "Every book you have been given. A book is one lender's record — its decisions, its interactions, its changes and its attestations all hang off whichever one is open here.",
  next: "Open a book. Nothing else on this screen has anything to show until you do.",
  nextWhenEmpty: "No book has been opened to you yet. That is granted per book, not per workspace.",
};

export function BooksPanel() {
  const { tab } = usePanelScope();
  const [state, setState] = useState<LegalDataState<LendingBook[]>>({ kind: "loading" });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!isBrokerMode()) {
      setState({ kind: "unavailable" });
      return;
    }
    let cancelled = false;
    setState({ kind: "loading" });
    listBooks()
      .then((books) => {
        if (!cancelled) setState({ kind: "ready", data: books });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        // A refusal is a correct answer, not a failure — see NO_BOOK_ACCESS_MESSAGE.
        const code = (e as { code?: unknown } | null)?.code;
        if (isRefusalCode(code)) {
          setState({ kind: "refused", message: NO_BOOK_ACCESS_MESSAGE });
          return;
        }
        console.warn("[lending books] load failed", e);
        setState({ kind: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSelect = (book: LendingBook) => {
    setSelectedId(book.id);
    const scopeId = tab.id;
    bus.emit("entity.selected", {
      scopeId,
      entityId: book.id,
      entityName: book.displayName,
    });
    bus.emit("chat.context", {
      scopeId,
      entityId: book.id,
      entityName: book.displayName,
      itemId: null,
      itemTitle: null,
    });
  };

  return (
    <LdPanelFrame
      title="Books"
      subject="books"
      state={state}
      explain={BOOKS_EXPLAIN}
      countOf={(rows) => rows.length}
      render={(books) => (
        <BooksView books={books} selectedId={selectedId} onSelect={handleSelect} />
      )}
    />
  );
}
