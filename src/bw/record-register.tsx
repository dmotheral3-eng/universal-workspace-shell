/**
 * THE RECORD REGISTER — every registry view that is not the interaction scan.
 *
 * The desk's promise is "a new list is a registry row, not a page build". Until
 * this file, only Interactions kept it: every other row in lending.view_registry
 * rendered a placeholder. This register renders ANY brokered resource the
 * registry names, from the rows themselves, so adding a view stays an INSERT.
 *
 * Same visual system as the scan register: light page, dense rows in the navy
 * pane, tokens only. Opening a row swaps the content column for its record and
 * its decision log, exactly like an exception does.
 */

import { useState } from "react";
import type { DecisionEntry, RecordRow } from "./data";

/** Bookkeeping columns the operator never needs to read in a list. */
const HIDDEN = new Set(["tenant_id", "book_id", "corrects_id", "before_state", "after_state"]);

export function labelOf(key: string): string {
  const s = key.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const ISO = /^\d{4}-\d{2}-\d{2}T/;

export function show(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "string" && ISO.test(v)) {
    return new Date(v).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
  }
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/** A short, sayable handle, taken from the tail of the id (same rule as the scan register). */
export function recordRef(prefix: string, id: string): string {
  const hex = id.replace(/[^0-9a-f]/gi, "");
  const tail = (hex.slice(-6) || id.slice(-6)).toUpperCase();
  return `${prefix}-${tail}`;
}

function prefixFor(viewKey: string): string {
  return (viewKey.replace(/[^a-z]/gi, "").slice(0, 2) || "RC").toUpperCase();
}

function idOf(row: RecordRow): string {
  return String(row.id ?? row.vendor_id ?? row.slug ?? "");
}

function columnsFor(rows: RecordRow[]): string[] {
  const keys = new Set<string>();
  rows.slice(0, 20).forEach((r) => Object.keys(r).forEach((k) => keys.add(k)));
  return [...keys].filter((k) => !HIDDEN.has(k) && k !== "id" && k !== "vendor_id").slice(0, 4);
}

const pane = {
  background: "var(--navypane)",
  border: "1px solid var(--navyline)",
  borderRadius: "var(--r-lg)",
} as const;

export function RecordRegister({
  title,
  viewKey,
  rows,
  bookLabel,
  onOpen,
}: {
  title: string;
  viewKey: string;
  rows: RecordRow[];
  bookLabel: string;
  onOpen: (row: RecordRow) => void;
}) {
  const cols = columnsFor(rows);
  const grid = { gridTemplateColumns: `7rem repeat(${Math.max(cols.length, 1)}, minmax(0,1fr))` };
  const prefix = prefixFor(viewKey);

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-2xl" style={{ fontFamily: "var(--font-display)", color: "var(--ink)" }}>{title}</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--body)" }}>
          {rows.length} on the record for {bookLabel}. Open any row to see the whole record and every decision made on it.
        </p>
      </div>

      <div className="overflow-x-auto" style={pane}>
        <div style={{ minWidth: `${7 + cols.length * 10}rem` }}>
          <div
            className="grid gap-3 px-4 py-2 text-[10px] uppercase tracking-[0.14em]"
            style={{ ...grid, color: "var(--oninvmute)", borderBottom: "1px solid var(--navyline)", fontFamily: "var(--font-mono)" }}
          >
            <div>Record</div>
            {cols.map((c) => <div key={c}>{labelOf(c)}</div>)}
          </div>

          {rows.length === 0 && (
            <div className="px-4 py-6 text-sm" style={{ color: "var(--oninvmute)" }}>Nothing recorded here yet.</div>
          )}

          {rows.map((r, i) => (
            <button
              key={idOf(r) || i}
              type="button"
              onClick={() => onOpen(r)}
              className="grid w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-left text-[13px] hover:opacity-90"
              style={{ ...grid, color: "var(--oninv)", borderBottom: "1px solid var(--navyline)", fontFamily: "var(--font-body)" }}
            >
              <span style={{ fontFamily: "var(--font-mono)", color: "var(--gold)" }}>{recordRef(prefix, idOf(r))}</span>
              {cols.map((c) => (
                <span key={c} className="truncate" style={{ color: "var(--oninvmute)" }}>{show(r[c])}</span>
              ))}
            </button>
          ))}
        </div>
      </div>

      <p className="mt-3 text-[11px]" style={{ color: "var(--faint)" }}>
        Fictional specimen data. Every lender on this surface is invented.
      </p>
    </div>
  );
}

export function RecordDetail({
  title,
  viewKey,
  row,
  decisions,
  onDecide,
  busy,
  error,
}: {
  title: string;
  viewKey: string;
  row: RecordRow;
  decisions: DecisionEntry[];
  onDecide: (action: "confirmed" | "waived", reason: string) => void;
  busy: boolean;
  error: string | null;
}) {
  const [reason, setReason] = useState("");
  const ref = recordRef(prefixFor(viewKey), idOf(row));
  const fields = Object.entries(row).filter(([k]) => k !== "tenant_id");

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <section>
        <h1 className="text-2xl" style={{ fontFamily: "var(--font-display)", color: "var(--ink)" }}>
          {title} · <span style={{ fontFamily: "var(--font-mono)", fontSize: "18px" }}>{ref}</span>
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--body)" }}>The whole record, as stored. Nothing here is edited in place; a correction is a new row.</p>
        <dl className="mt-4 overflow-hidden" style={pane}>
          {fields.map(([k, v]) => (
            <div key={k} className="grid grid-cols-[10rem_minmax(0,1fr)] gap-3 px-4 py-2 text-[13px]" style={{ borderBottom: "1px solid var(--navyline)" }}>
              <dt className="text-[10px] uppercase tracking-[0.12em]" style={{ fontFamily: "var(--font-mono)", color: "var(--oninvmute)", paddingTop: 2 }}>{labelOf(k)}</dt>
              <dd className="m-0 min-w-0 break-words" style={{ color: "var(--oninv)", fontFamily: typeof v === "object" && v ? "var(--font-mono)" : "var(--font-body)" }}>{show(v)}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section>
        <h2 className="text-lg" style={{ fontFamily: "var(--font-display)", color: "var(--ink)" }}>Decisions on this record</h2>
        <div className="mt-3 p-4" style={{ background: "var(--page2)", border: "1px solid var(--line)", borderRadius: "var(--r-lg)" }}>
          <label htmlFor="decision-reason" className="text-[11px] uppercase tracking-[0.12em]" style={{ fontFamily: "var(--font-mono)", color: "var(--faint)" }}>Reason (required, 8 characters or more)</label>
          <textarea
            id="decision-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            className="mt-1 w-full px-2 py-1.5 text-[13px] outline-none"
            style={{ background: "var(--page)", border: "1px solid var(--line)", borderRadius: "var(--r-md)", color: "var(--ink)" }}
            placeholder="What you looked at and why"
          />
          <div className="mt-2 flex gap-2">
            <button type="button" disabled={busy || reason.trim().length < 8} onClick={() => { onDecide("confirmed", reason.trim()); setReason(""); }}
              className="px-3 py-1.5 text-[13px] disabled:opacity-40" style={{ background: "var(--ink)", color: "var(--page)", borderRadius: "var(--r-md)" }}>
              Confirm
            </button>
            <button type="button" disabled={busy || reason.trim().length < 8} onClick={() => { onDecide("waived", reason.trim()); setReason(""); }}
              className="px-3 py-1.5 text-[13px] disabled:opacity-40" style={{ border: "1px solid var(--line)", color: "var(--ink)", borderRadius: "var(--r-md)" }}>
              Waive
            </button>
          </div>
          {error && <p className="mt-2 text-[12px]" style={{ color: "var(--down)" }}>Not recorded: {error}</p>}
        </div>

        <ol className="mt-3 grid gap-2 p-0" style={{ listStyle: "none" }}>
          {decisions.length === 0 && <li className="text-[13px]" style={{ color: "var(--faint)" }}>No decisions yet.</li>}
          {decisions.map((d) => (
            <li key={d.id} className="p-3 text-[13px]" style={{ border: "1px solid var(--line)", borderRadius: "var(--r-md)", background: "var(--page)" }}>
              <div style={{ color: "var(--ink)" }}><b>{d.action === "waived" ? "Waived" : "Confirmed"}</b> by {d.decidedBy || "—"} · {show(d.decidedAt)}</div>
              <div className="mt-1" style={{ color: "var(--body)" }}>{d.reason}</div>
              <div className="mt-1 text-[11px]" style={{ fontFamily: "var(--font-mono)", color: "var(--faint)" }}>rule version {d.ruleVersion || "—"}</div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
