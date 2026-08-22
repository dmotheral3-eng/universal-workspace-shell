/**
 * THE ACTION REGISTER — one decision, on light.
 *
 * This is NOT a page takeover. It renders inside the same content column the
 * scan register occupied, under the same header, the same lender switcher and
 * the same registry sidebar. Dave's note on the mock was that a full-screen
 * drill "feels weird like not the same system" — and it was right: swapping the
 * whole chrome turns two registers into two apps. Here the chrome never moves;
 * only the density does.
 *
 * Light page, gold-soft rule card, navy evidence pane, sage confirm. Every colour
 * is a token.
 */

import { useState } from "react";
import type { DecisionEntry, ScanRow } from "./data";
import { shortRef } from "./scan-register";

const RULE_TEXT: Record<string, { title: string; body: string; cite: string }> = {
  "settlement-authority": {
    title: "Settlement language requires settlement authority",
    body: "An agent may not describe, offer or imply a settlement, payoff figure or balance reduction unless the agent holds settlement authority on the account.",
    cite: "collections policy §5.4.3",
  },
  "contact-frequency": {
    title: "Contact frequency within the presumption",
    body: "Repeated telephone contact with the same number about the same debt is limited over a rolling seven-day window once right-party contact has been made.",
    cite: "collections policy §3.1.1",
  },
  "fee-disclosure": {
    title: "Fee disclosure language",
    body: "Any fee named on a monitored contact must be described with the schedule version in force at the time of the contact.",
    cite: "collections policy §4.2.6",
  },
  "right-party-contact": {
    title: "Right-party contact before account detail",
    body: "No balance, status or account detail may be disclosed before the agent has confirmed they are speaking with the right party.",
    cite: "collections policy §2.2.4",
  },
};

function ruleFor(key: string | null) {
  return (
    (key && RULE_TEXT[key]) || {
      title: (key ?? "flagged").replace(/[-_]/g, " "),
      body: "This rule is carried on the book but its text has not been filed on this surface.",
      cite: "policy text not filed",
    }
  );
}

export function ActionRegister({
  row,
  bookLabel,
  decisions,
  onDecide,
  busy,
  error,
}: {
  row: ScanRow;
  bookLabel: string;
  decisions: DecisionEntry[];
  onDecide: (action: "confirmed" | "waived", reason: string) => void;
  busy: boolean;
  error: string | null;
}) {
  const [reason, setReason] = useState("");
  const rule = ruleFor(row.flagRule);
  const settled = decisions.length > 0;
  const tooShort = reason.trim().length < 8;

  return (
    <div className="max-w-3xl">
      <h1
        className="text-2xl"
        style={{ fontFamily: "var(--font-display)", color: "var(--ink)" }}
      >
        {shortRef(row.id)}
      </h1>
      <p className="mt-1 text-sm" style={{ color: "var(--body)" }}>
        {row.channel ?? "contact"} on {bookLabel}, handled by {row.agentRef ?? "—"}, scored
        against {row.policyVersion ?? "the policy in force"}.
      </p>

      {/* THE RULE IN FORCE — gold-soft, because it is the thing being applied. */}
      <div
        className="mt-5 p-4"
        style={{
          background: "var(--gold-soft)",
          border: "1px solid var(--gold)",
          borderRadius: "var(--r-lg)",
        }}
      >
        <div
          className="text-[10px] uppercase tracking-[0.14em]"
          style={{ fontFamily: "var(--font-mono)", color: "var(--gold-deep)" }}
        >
          Rule in force · {row.policyVersion ?? "unversioned"}
        </div>
        <div className="mt-1 text-[15px]" style={{ color: "var(--ink)" }}>
          {rule.title}
        </div>
        <p className="mt-1.5 text-sm" style={{ color: "var(--body)" }}>
          {rule.body}
        </p>
        <div className="mt-2 text-[11px]" style={{ fontFamily: "var(--font-mono)", color: "var(--gold-deep)" }}>
          {rule.cite}
        </div>
      </div>

      {/* THE EVIDENCE — navy, because it is dense and it is the record. */}
      <div
        className="mt-4 p-4"
        style={{
          background: "var(--navypane)",
          border: "1px solid var(--navyline)",
          borderRadius: "var(--r-lg)",
        }}
      >
        <div
          className="text-[10px] uppercase tracking-[0.14em]"
          style={{ fontFamily: "var(--font-mono)", color: "var(--oninvmute)" }}
        >
          What the record holds
        </div>
        <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1.5 text-[13px]">
          {[
            ["Occurred", row.occurredAt ? new Date(row.occurredAt).toLocaleString("en-US") : "—"],
            ["Channel", row.channel ?? "—"],
            ["Handled by", row.agentRef ?? "—"],
            ["Scored against", row.policyVersion ?? "—"],
            ["Rule tripped", (row.flagRule ?? "—").replace(/[-_]/g, " ")],
            ["Disposition", row.disposition ?? "—"],
          ].map(([k, v]) => (
            <div key={k} className="contents">
              <dt style={{ color: "var(--oninvmute)" }}>{k}</dt>
              <dd style={{ color: "var(--oninv)", fontFamily: "var(--font-mono)" }}>{v}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* THE GATE */}
      {settled ? (
        <div
          className="mt-4 p-4"
          style={{
            background: "var(--sage-soft)",
            border: "1px solid var(--sage)",
            borderRadius: "var(--r-lg)",
          }}
        >
          <div className="text-[13px]" style={{ color: "var(--ink)" }}>
            Recorded. Your name, your reason and the rule version are part of this row now.
          </div>
          {decisions.map((d) => (
            <div
              key={d.id}
              className="mt-2 text-[12px]"
              style={{ fontFamily: "var(--font-mono)", color: "var(--sage-deep)" }}
            >
              {d.action} · {d.decidedBy} · {d.ruleVersion} ·{" "}
              {d.decidedAt ? new Date(d.decidedAt).toLocaleString("en-US") : ""}
              <div style={{ color: "var(--body)" }}>&ldquo;{d.reason}&rdquo;</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-4">
          <label
            className="text-[10px] uppercase tracking-[0.14em]"
            style={{ fontFamily: "var(--font-mono)", color: "var(--faint)" }}
          >
            Your reason — it becomes part of the record
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            className="mt-1 w-full p-2 text-sm outline-none"
            style={{
              background: "var(--page)",
              border: "1px solid var(--line)",
              borderRadius: "var(--r-md)",
              color: "var(--ink)",
              fontFamily: "var(--font-body)",
            }}
            placeholder="Why this is, or is not, a violation."
          />
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              disabled={busy || tooShort}
              onClick={() => onDecide("confirmed", reason.trim())}
              className="px-3 py-1.5 text-[13px] disabled:opacity-40"
              style={{
                background: "var(--sage-deep)",
                color: "var(--page)",
                borderRadius: "var(--r-md)",
              }}
            >
              Confirm violation
            </button>
            <button
              type="button"
              disabled={busy || tooShort}
              onClick={() => onDecide("waived", reason.trim())}
              className="px-3 py-1.5 text-[13px] disabled:opacity-40"
              style={{
                background: "var(--page)",
                color: "var(--gold-deep)",
                border: "1px solid var(--gold)",
                borderRadius: "var(--r-md)",
              }}
            >
              Waive with reason
            </button>
            {tooShort && (
              <span className="text-[11px]" style={{ color: "var(--faint)" }}>
                A reason is required — the record refuses a blank one.
              </span>
            )}
          </div>
          {error && (
            <div className="mt-2 text-[12px]" style={{ color: "var(--down)" }}>
              Not recorded: {error}
            </div>
          )}
        </div>
      )}

      <p className="mt-4 text-[11px]" style={{ color: "var(--faint)" }}>
        Fictional specimen data. The decision record is real.
      </p>
    </div>
  );
}
