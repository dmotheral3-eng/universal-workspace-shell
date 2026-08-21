import { useCallback } from "react";
import { listChanges, type LendingChange } from "@/data/lending-broker";
import { LdNote, dateTime, humanize } from "@/panels/legal/ld-kit";
import { LdPanelFrame, type LdExplainCopy } from "@/panels/legal/ld-panel-frame";
import { CorrectionMark, EvidenceTable } from "./evidence-table";
import { useLendingData } from "./use-lending-data";

export function ChangesView({ changes }: { changes: LendingChange[] }) {
  return (
    <div>
      <LdNote>What changed in this book, who changed it, and the reason they gave.</LdNote>
      <EvidenceTable
        rows={changes}
        emptyLine="No changes recorded for this book."
        columns={[
          {
            key: "recorded",
            header: "When",
            muted: true,
            cell: (c) => (
              <>
                {dateTime(c.recordedAt)}
                <CorrectionMark correctsId={c.correctsId} />
              </>
            ),
          },
          { key: "path", header: "What", cell: (c) => c.path ?? "—" },
          { key: "intent", header: "Intent", cell: (c) => humanize(c.intent) || "—" },
          {
            key: "author",
            header: "Who",
            cell: (c) =>
              c.author ? `${c.author}${c.authorKind ? ` · ${humanize(c.authorKind)}` : ""}` : "—",
          },
          { key: "status", header: "Status", cell: (c) => humanize(c.status) || "—" },
          { key: "reasoning", header: "Reason given", muted: true, cell: (c) => c.reasoning ?? "—" },
        ]}
      />
    </div>
  );
}

export const CHANGES_EXPLAIN: LdExplainCopy = {
  what: "The change log for this book: what moved, who moved it, whether they were a person or a system, and the reasoning they recorded at the time.",
  next: "Look for changes with no reasoning — a change nobody explained is the one that is hard to defend later.",
  nextWhenEmpty: "Nothing has been changed on this book yet.",
};

export function ChangesPanel() {
  const load = useCallback((bookId: string) => listChanges(bookId), []);
  const { state } = useLendingData<LendingChange[]>(load);

  return (
    <LdPanelFrame
      title="Changes"
      subject="changes"
      state={state}
      explain={CHANGES_EXPLAIN}
      countOf={(rows) => rows.length}
      render={(changes) => <ChangesView changes={changes} />}
    />
  );
}
