/**
 * THE BORROWWORKS OPERATOR APP — one shell, two densities.
 *
 * v3 of the mock exists because v1 and v2 got this wrong: the drill was a
 * full-screen overlay, so the chrome vanished and the two registers read as two
 * different products. Dave's words were "it feels weird like not the same
 * system". They were right, and the fix is structural rather than cosmetic —
 * the header, the lender switcher and the registry sidebar are rendered ONCE,
 * here, and never unmount. Opening an exception swaps the CONTENT COLUMN and
 * nothing else, and you get back by a breadcrumb rather than a back button.
 *
 * The nav is not written in this file. It is read from lending.view_registry,
 * because "a new list is a registry row, not a page build" is only true if the
 * code cannot hardcode the list.
 */

import { useCallback, useEffect, useState } from "react";
import {
  listBooks, listDecisions, listRegistryViews, listScanRows, recordDecision,
  type DecisionEntry, type LenderBook, type RegistryView, type ScanRow,
} from "./data";
import { ScanRegister, shortRef } from "./scan-register";
import { ActionRegister } from "./action-register";
import "@/styles/tokens.css";

type Load<T> = { phase: "loading" } | { phase: "error"; code: string } | { phase: "ready"; data: T };

export function BorrowWorksApp() {
  const [views, setViews] = useState<Load<RegistryView[]>>({ phase: "loading" });
  const [books, setBooks] = useState<LenderBook[]>([]);
  const [bookId, setBookId] = useState<string | null>(null);
  const [viewKey, setViewKey] = useState<string>("interactions");
  const [rows, setRows] = useState<Load<ScanRow[]>>({ phase: "loading" });
  const [open, setOpen] = useState<ScanRow | null>(null);
  const [decisions, setDecisions] = useState<DecisionEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [writeError, setWriteError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const [v, b] = await Promise.all([listRegistryViews(), listBooks()]);
        if (!live) return;
        setViews({ phase: "ready", data: v });
        setBooks(b);
        setBookId((cur) => cur ?? b[0]?.id ?? null);
        if (v.length && !v.some((x) => x.viewKey === "interactions")) setViewKey(v[0].viewKey);
      } catch (e) {
        if (live) setViews({ phase: "error", code: (e as Error).message });
      }
    })();
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (!bookId) return;
    let live = true;
    setRows({ phase: "loading" });
    setOpen(null);
    listScanRows(bookId)
      .then((r) => live && setRows({ phase: "ready", data: r }))
      .catch((e) => live && setRows({ phase: "error", code: (e as Error).message }));
    return () => { live = false; };
  }, [bookId]);

  const openRow = useCallback((row: ScanRow) => {
    setOpen(row);
    setWriteError(null);
    setDecisions([]);
    listDecisions(shortRef(row.id)).then(setDecisions).catch(() => setDecisions([]));
  }, []);

  const decide = useCallback(
    async (action: "confirmed" | "waived", reason: string) => {
      if (!open || !bookId) return;
      setBusy(true);
      setWriteError(null);
      try {
        const entry = await recordDecision({
          bookId,
          subjectKind: "interaction",
          subjectRef: shortRef(open.id),
          action,
          reason,
          ruleVersion: open.policyVersion ?? "unversioned",
        });
        setDecisions((d) => [entry, ...d]);
      } catch (e) {
        setWriteError((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [open, bookId]
  );

  const book = books.find((b) => b.id === bookId);
  const bookLabel = book?.displayName ?? "this book";

  return (
    <div
      className="flex h-screen w-screen flex-col overflow-hidden"
      style={{ background: "var(--page)", fontFamily: "var(--font-body)", color: "var(--ink)" }}
    >
      {/* ── HEADER — persistent ─────────────────────────────────────────── */}
      <header
        className="flex shrink-0 items-center justify-between px-5 py-3"
        style={{ borderBottom: "1px solid var(--line)" }}
      >
        <div className="flex items-baseline gap-3">
          <span style={{ fontFamily: "var(--font-display)", fontSize: "17px" }}>BorrowWorks</span>
          <span
            className="text-[10px] uppercase tracking-[0.18em]"
            style={{ fontFamily: "var(--font-mono)", color: "var(--faint)" }}
          >
            evidence desk
          </span>
        </div>

        {/* LENDER SWITCHER — persistent. One operator, several books, no bleed. */}
        <label className="flex items-center gap-2">
          <span
            className="text-[10px] uppercase tracking-[0.14em]"
            style={{ fontFamily: "var(--font-mono)", color: "var(--faint)" }}
          >
            Book
          </span>
          <select
            value={bookId ?? ""}
            onChange={(e) => setBookId(e.target.value)}
            className="px-2 py-1 text-[13px] outline-none"
            style={{
              background: "var(--page2)",
              border: "1px solid var(--line)",
              borderRadius: "var(--r-md)",
              color: "var(--ink)",
            }}
          >
            {books.map((b) => (
              <option key={b.id} value={b.id}>{b.displayName}</option>
            ))}
          </select>
        </label>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* ── REGISTRY SIDEBAR — persistent, and read from the registry ──── */}
        <nav
          className="w-56 shrink-0 overflow-y-auto px-3 py-4"
          style={{ background: "var(--page2)", borderRight: "1px solid var(--line)" }}
        >
          {views.phase === "loading" && (
            <div className="text-[12px]" style={{ color: "var(--faint)" }}>Reading the registry…</div>
          )}
          {views.phase === "error" && (
            <div className="text-[12px]" style={{ color: "var(--down)" }}>
              The registry did not answer ({views.code}). The nav is data, so nothing is
              guessed when it is unreachable.
            </div>
          )}
          {views.phase === "ready" &&
            views.data.map((v) => {
              const on = v.viewKey === viewKey;
              return (
                <button
                  key={v.viewKey}
                  type="button"
                  onClick={() => { setViewKey(v.viewKey); setOpen(null); }}
                  className="mb-0.5 block w-full px-2.5 py-1.5 text-left text-[13px]"
                  style={{
                    background: on ? "var(--page)" : "transparent",
                    border: on ? "1px solid var(--line)" : "1px solid transparent",
                    borderRadius: "var(--r-md)",
                    color: on ? "var(--ink)" : "var(--body)",
                  }}
                >
                  {v.label}
                </button>
              );
            })}
          <p className="mt-4 text-[10px] leading-relaxed" style={{ color: "var(--faint)" }}>
            This nav is a table. A new list is a registry row, not a page build.
          </p>
        </nav>

        {/* ── CONTENT COLUMN — the ONLY thing that swaps ──────────────────── */}
        <main className="flex-1 overflow-y-auto px-6 py-5">
          {open && (
            <button
              type="button"
              onClick={() => setOpen(null)}
              className="mb-3 text-[11px]"
              style={{ fontFamily: "var(--font-mono)", color: "var(--body)" }}
            >
              Interactions <span style={{ color: "var(--faint)" }}>/</span> {shortRef(open.id)}
            </button>
          )}

          {viewKey !== "interactions" ? (
            <div className="text-sm" style={{ color: "var(--body)" }}>
              <h1 className="text-2xl" style={{ fontFamily: "var(--font-display)", color: "var(--ink)" }}>
                {views.phase === "ready"
                  ? views.data.find((v) => v.viewKey === viewKey)?.label ?? viewKey
                  : viewKey}
              </h1>
              <p className="mt-1">
                This surface is registered and its rows are brokered, but the scan register
                built under this dispatch covers monitored contact. Nothing is mocked here in
                its place.
              </p>
            </div>
          ) : rows.phase === "loading" ? (
            <div className="text-sm" style={{ color: "var(--faint)" }}>Reading the record…</div>
          ) : rows.phase === "error" ? (
            <div className="text-sm" style={{ color: "var(--down)" }}>
              The record did not answer ({rows.code}).
            </div>
          ) : open ? (
            <ActionRegister
              row={open}
              bookLabel={bookLabel}
              decisions={decisions}
              onDecide={decide}
              busy={busy}
              error={writeError}
            />
          ) : (
            <ScanRegister rows={rows.data} bookLabel={bookLabel} onOpen={openRow} />
          )}
        </main>
      </div>
    </div>
  );
}

export default BorrowWorksApp;
