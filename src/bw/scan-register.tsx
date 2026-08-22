/**
 * THE SCAN REGISTER — density, on navy.
 *
 * The wealth insight this app inherits: the PAGE is light and stays light, and
 * density lives inside a navy pane. So a list of nine thousand monitored contacts
 * is not a dark app — it is a dark pane on a light page, which is why moving from
 * here to a decision surface does not feel like changing products.
 *
 * Every colour is a token. There are no hexes in this file by design.
 */

import type { ScanRow } from "./data";

function when(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

function ruleLabel(rule: string | null): string {
  return (rule ?? "").replace(/[-_]/g, " ") || "flagged";
}

/**
 * A short, sayable handle for a record — derived, never invented.
 *
 * Taken from the END of the id, not the start: ids minted in one batch commonly
 * share a leading run, and a prefix slice turned five different records into
 * five identical "IR-A1B2C" labels the first time this was rendered. The tail is
 * where uuid entropy actually lives.
 */
export function shortRef(id: string): string {
  const hex = id.replace(/[^0-9a-f]/gi, "");
  return `IR-${(hex.slice(-6) || hex).toUpperCase()}`;
}

export function ScanRegister({
  rows,
  bookLabel,
  onOpen,
  /**
   * The heading tag to render the title as. Defaults to h1, which is right when
   * this IS the page — the operator desk is unchanged by this prop existing.
   *
   * It exists because the register is now embedded elsewhere as a specimen, and
   * a page carrying three h1 elements has no document outline. The alternative
   * was a second copy of the register that drifts from this one, which is worse
   * than a prop.
   */
  headingAs: Heading = "h1",
}: {
  rows: ScanRow[];
  bookLabel: string;
  onOpen: (row: ScanRow) => void;
  headingAs?: "h1" | "h2" | "h3";
}) {
  const exceptions = rows.filter((r) => r.flagged).length;

  return (
    <div>
      <div className="mb-4">
        <Heading
          className="text-2xl"
          style={{ fontFamily: "var(--font-display)", color: "var(--ink)" }}
        >
          Interactions
        </Heading>
        <p className="mt-1 text-sm" style={{ color: "var(--body)" }}>
          Every monitored contact on {bookLabel}, scored against the policy in force that
          day.{" "}
          <span style={{ color: "var(--ink)" }}>
            {exceptions} of {rows.length} need a human.
          </span>{" "}
          The rest are recorded and need nobody.
        </p>
      </div>

      {/* THE NAVY PANE — the signature wrapper for dense rows. */}
      <div
        className="overflow-hidden"
        style={{
          background: "var(--navypane)",
          border: "1px solid var(--navyline)",
          borderRadius: "var(--r-lg)",
        }}
      >
        <div
          className="grid grid-cols-[7rem_minmax(0,1fr)_9rem_6.5rem] gap-3 px-4 py-2 text-[10px] uppercase tracking-[0.14em]"
          style={{
            color: "var(--oninvmute)",
            borderBottom: "1px solid var(--navyline)",
            fontFamily: "var(--font-mono)",
          }}
        >
          <div>Record</div>
          <div>What tripped</div>
          <div>When</div>
          <div>State</div>
        </div>

        {rows.length === 0 && (
          <div className="px-4 py-6 text-sm" style={{ color: "var(--oninvmute)" }}>
            Nothing recorded on this book yet.
          </div>
        )}

        {rows.map((r) => {
          const isException = r.flagged;
          return (
            <button
              key={r.id}
              type="button"
              disabled={!isException}
              onClick={() => isException && onOpen(r)}
              className={`grid w-full grid-cols-[7rem_minmax(0,1fr)_9rem_6.5rem] items-center gap-3 px-4 py-2.5 text-left text-[13px] ${
                isException ? "cursor-pointer hover:opacity-90" : "cursor-default"
              }`}
              style={{
                color: "var(--oninv)",
                borderBottom: "1px solid var(--navyline)",
                fontFamily: "var(--font-body)",
              }}
            >
              <span style={{ fontFamily: "var(--font-mono)", color: "var(--gold)" }}>
                {shortRef(r.id)}
              </span>

              <span className="flex min-w-0 items-center gap-2">
                {isException ? (
                  <>
                    <span
                      className="shrink-0 rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wider"
                      style={{
                        fontFamily: "var(--font-mono)",
                        background: "var(--navy)",
                        color: "var(--gold)",
                        border: "1px solid var(--navyline)",
                        borderRadius: "var(--r-sm)",
                      }}
                    >
                      {ruleLabel(r.flagRule)}
                    </span>
                    <span className="truncate" style={{ color: "var(--oninvmute)" }}>
                      {r.channel ?? "contact"} handled by {r.agentRef ?? "—"}
                    </span>
                  </>
                ) : (
                  <span className="truncate" style={{ color: "var(--oninvmute)" }}>
                    {r.channel ?? "contact"} handled by {r.agentRef ?? "—"} · within policy
                  </span>
                )}
              </span>

              <span style={{ fontFamily: "var(--font-mono)", color: "var(--oninvmute)" }}>
                {when(r.occurredAt)}
              </span>

              <span
                className="justify-self-start rounded px-2 py-0.5 text-[10px] uppercase tracking-wider"
                style={{
                  fontFamily: "var(--font-mono)",
                  borderRadius: "var(--r-sm)",
                  border: "1px solid var(--navyline)",
                  color: isException ? "var(--down-oninv)" : "var(--up-oninv)",
                }}
              >
                {isException ? r.disposition ?? "exception" : "clear"}
              </span>
            </button>
          );
        })}
      </div>

      <p className="mt-3 text-[11px]" style={{ color: "var(--faint)" }}>
        Fictional specimen data. Every lender on this surface is invented.
      </p>
    </div>
  );
}
