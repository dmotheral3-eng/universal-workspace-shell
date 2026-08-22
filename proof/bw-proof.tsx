/**
 * D-BWUI-1 proof harness.
 *
 * Renders the REAL ScanRegister and ActionRegister components against the rows
 * actually seeded into lending.evidence_interactions, with no network and no
 * session. The shipped app reads those same rows through the broker; this entry
 * exists because the product path requires a master session, so an un-shimmed
 * screenshot would photograph a sign-in page instead of the work.
 *
 * Nothing here can reach the shipped bundle — see vite.proof.config.ts.
 */

import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { ScanRegister, shortRef } from "@/bw/scan-register";
import { ActionRegister } from "@/bw/action-register";
import type { ScanRow } from "@/bw/data";
import "@/styles/tokens.css";
import "@/index.css";
import REGISTRY from "./bw-registry.json";

/** Verbatim from lending.evidence_interactions for the Bluebonnet book. */
const ROWS: ScanRow[] = [
  { id: "a1b2c3d4-0000-4000-8000-00007f3a91", bookId: "bb", channel: "call", occurredAt: "2027-01-18T16:40:00Z", agentRef: "AGT-114", policyVersion: "collections-policy-v12", flagged: true,  flagRule: "settlement-authority", disposition: "escalated" },
  { id: "a1b2c3d4-0000-4000-8000-00002c6be4", bookId: "bb", channel: "call", occurredAt: "2027-01-18T11:02:00Z", agentRef: "AGT-207", policyVersion: "collections-policy-v12", flagged: false, flagRule: null,                   disposition: "closed" },
  { id: "a1b2c3d4-0000-4000-8000-000090d17c", bookId: "bb", channel: "call", occurredAt: "2027-01-17T09:15:00Z", agentRef: "AGT-114", policyVersion: "collections-policy-v12", flagged: true,  flagRule: "contact-frequency",    disposition: "in_review" },
  { id: "a1b2c3d4-0000-4000-8000-00004ae2f8", bookId: "bb", channel: "chat", occurredAt: "2027-01-16T14:22:00Z", agentRef: "AGT-052", policyVersion: "collections-policy-v12", flagged: true,  flagRule: "fee-disclosure",       disposition: "in_review" },
  { id: "a1b2c3d4-0000-4000-8000-0000b53c60", bookId: "bb", channel: "call", occurredAt: "2027-01-15T15:48:00Z", agentRef: "AGT-330", policyVersion: "collections-policy-v11", flagged: true,  flagRule: "right-party-contact",  disposition: "escalated" },
];

const BOOK = "Bluebonnet Lending (fictional specimen)";

/**
 * The chrome is rendered here too, because the thing being proved is that it
 * PERSISTS: the drill swaps the content column and nothing else.
 */
function Harness() {
  const [open, setOpen] = useState<ScanRow | null>(null);
  const [decided, setDecided] = useState<boolean>(false);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden"
      style={{ background: "var(--page)", fontFamily: "var(--font-body)", color: "var(--ink)" }}>
      <header className="flex shrink-0 items-center justify-between px-5 py-3" style={{ borderBottom: "1px solid var(--line)" }}>
        <div className="flex items-baseline gap-3">
          <span style={{ fontFamily: "var(--font-display)", fontSize: "17px" }}>BorrowWorks</span>
          <span className="text-[10px] uppercase tracking-[0.18em]" style={{ fontFamily: "var(--font-mono)", color: "var(--faint)" }}>evidence desk</span>
        </div>
        <label className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-[0.14em]" style={{ fontFamily: "var(--font-mono)", color: "var(--faint)" }}>Book</span>
          <select className="px-2 py-1 text-[13px] outline-none" style={{ background: "var(--page2)", border: "1px solid var(--line)", borderRadius: "var(--r-md)", color: "var(--ink)" }}>
            <option>Bluebonnet Lending (fictional specimen)</option>
            <option>Redbud Credit (fictional specimen)</option>
            <option>Caprock Finance (fictional specimen)</option>
            <option>Palo Duro Loan Co (fictional specimen)</option>
          </select>
        </label>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <nav className="w-56 shrink-0 px-3 py-4" style={{ background: "var(--page2)", borderRight: "1px solid var(--line)" }}>
          {/* Rendered from proof/bw-registry.json, which is a dump of the LIVE
              lending.view_registry rows — not a list typed into this file. */}
          {REGISTRY.map((v, i) => (
            <div key={v.viewKey} className="mb-0.5 px-2.5 py-1.5 text-[13px]"
              style={{
                background: i === 0 ? "var(--page)" : "transparent",
                border: i === 0 ? "1px solid var(--line)" : "1px solid transparent",
                borderRadius: "var(--r-md)",
                color: i === 0 ? "var(--ink)" : "var(--body)",
              }}>{v.label}</div>
          ))}
          <p className="mt-4 text-[10px] leading-relaxed" style={{ color: "var(--faint)" }}>
            This nav is a table. A new list is a registry row, not a page build.
          </p>
        </nav>

        <main className="flex-1 overflow-y-auto px-6 py-5">
          {open && (
            <button type="button" onClick={() => { setOpen(null); setDecided(false); }} className="mb-3 text-[11px]"
              style={{ fontFamily: "var(--font-mono)", color: "var(--body)" }}>
              Interactions <span style={{ color: "var(--faint)" }}>/</span> {shortRef(open.id)}
            </button>
          )}
          {open ? (
            <ActionRegister
              row={open}
              bookLabel={BOOK}
              decisions={decided ? [{ id: "d1", subjectRef: shortRef(open.id), action: "confirmed", reason: "Agent offered a balance reduction without settlement authority on the account.", ruleVersion: open.policyVersion ?? "", decidedBy: "operator@borrowworks.test", decidedAt: "2027-01-19T09:12:00Z" }] : []}
              onDecide={() => setDecided(true)}
              busy={false}
              error={null}
            />
          ) : (
            <ScanRegister rows={ROWS} bookLabel={BOOK} onOpen={setOpen} />
          )}
        </main>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode><Harness /></StrictMode>
);
