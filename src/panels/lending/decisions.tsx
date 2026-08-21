import { useCallback } from "react";
import { listDecisions, type LendingDecision } from "@/data/lending-broker";
import { LdNote, dateOnly, dateTime, humanize } from "@/panels/legal/ld-kit";
import { LdPanelFrame, type LdExplainCopy } from "@/panels/legal/ld-panel-frame";
import { CorrectionMark, EvidenceTable } from "./evidence-table";
import { useLendingData } from "./use-lending-data";

export function DecisionsView({ decisions }: { decisions: LendingDecision[] }) {
  return (
    <div>
      <LdNote>Every decision the model influenced, with who reviewed it and when.</LdNote>
      <EvidenceTable
        rows={decisions}
        emptyLine="No decisions recorded for this book."
        columns={[
          {
            key: "ref",
            header: "Decision",
            cell: (d) => (
              <>
                {d.ref ?? "—"}
                <CorrectionMark correctsId={d.correctsId} />
              </>
            ),
          },
          { key: "decided", header: "Decided", muted: true, cell: (d) => dateTime(d.decidedAt) },
          { key: "outcome", header: "Outcome", cell: (d) => humanize(d.outcome) || "—" },
          { key: "model", header: "Model", muted: true, cell: (d) => d.modelVersion ?? "—" },
          {
            key: "review",
            header: "Human review",
            cell: (d) =>
              d.reviewer
                ? `${humanize(d.reviewAction) || "reviewed"} · ${d.reviewer}`
                : "not reviewed",
          },
          { key: "retention", header: "Retain until", muted: true, cell: (d) => dateOnly(d.retentionUntil) },
        ]}
      />
    </div>
  );
}

export const DECISIONS_EXPLAIN: LdExplainCopy = {
  what: "The decisions in this book that an automated system had a hand in — the outcome, the version that produced it, and whether a person looked at it.",
  next: "Read the rows with no human review first: those are the ones an examiner asks about.",
  nextWhenEmpty: "Nothing has been filed against this book yet.",
};

export function DecisionsPanel() {
  const load = useCallback((bookId: string) => listDecisions(bookId), []);
  const { state } = useLendingData<LendingDecision[]>(load);

  return (
    <LdPanelFrame
      title="Decisions"
      subject="decisions"
      state={state}
      explain={DECISIONS_EXPLAIN}
      countOf={(rows) => rows.length}
      render={(decisions) => <DecisionsView decisions={decisions} />}
    />
  );
}
