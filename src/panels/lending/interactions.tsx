import { useCallback } from "react";
import { listInteractions, type LendingInteraction } from "@/data/lending-broker";
import { LdNote, LdPill, dateTime, humanize } from "@/panels/legal/ld-kit";
import { LdPanelFrame, type LdExplainCopy } from "@/panels/legal/ld-panel-frame";
import { CorrectionMark, EvidenceTable } from "./evidence-table";
import { useLendingData } from "./use-lending-data";

export function InteractionsView({ interactions }: { interactions: LendingInteraction[] }) {
  const flagged = interactions.filter((i) => i.flagged).length;
  return (
    <div>
      <LdNote>
        {flagged === 0
          ? "Nothing in this set was flagged by a monitoring rule."
          : `${flagged} of ${interactions.length} were flagged by a monitoring rule.`}
      </LdNote>
      <EvidenceTable
        rows={interactions}
        emptyLine="No interactions recorded for this book."
        columns={[
          {
            key: "occurred",
            header: "When",
            muted: true,
            cell: (i) => (
              <>
                {dateTime(i.occurredAt)}
                <CorrectionMark correctsId={i.correctsId} />
              </>
            ),
          },
          { key: "channel", header: "Channel", cell: (i) => humanize(i.channel) || "—" },
          { key: "agent", header: "Handled by", muted: true, cell: (i) => i.agentRef ?? "—" },
          { key: "policy", header: "Policy", muted: true, cell: (i) => i.policyVersion ?? "—" },
          {
            key: "flag",
            header: "Flag",
            cell: (i) =>
              i.flagged ? (
                <LdPill label={humanize(i.flagRule) || "flagged"} tone="attention" />
              ) : (
                "—"
              ),
          },
          { key: "disposition", header: "Disposition", cell: (i) => humanize(i.disposition) || "—" },
        ]}
      />
    </div>
  );
}

export const INTERACTIONS_EXPLAIN: LdExplainCopy = {
  what: "Every monitored contact on this book — the channel, who or what handled it, the policy in force at the time, and whether a rule flagged it.",
  next: "Start with the flagged rows and check each one has a disposition.",
  nextWhenEmpty: "No monitored contact has been filed against this book yet.",
};

export function InteractionsPanel() {
  const load = useCallback((bookId: string) => listInteractions(bookId), []);
  const { state } = useLendingData<LendingInteraction[]>(load);

  return (
    <LdPanelFrame
      title="Interactions"
      subject="interactions"
      state={state}
      explain={INTERACTIONS_EXPLAIN}
      countOf={(rows) => rows.length}
      render={(interactions) => <InteractionsView interactions={interactions} />}
    />
  );
}
