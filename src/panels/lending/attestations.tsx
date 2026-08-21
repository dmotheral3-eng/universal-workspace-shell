import { useCallback } from "react";
import { listAttestations, type LendingAttestation } from "@/data/lending-broker";
import { LdNote, dateOnly, humanize } from "@/panels/legal/ld-kit";
import { LdPanelFrame, type LdExplainCopy } from "@/panels/legal/ld-panel-frame";
import { CorrectionMark, EvidenceTable } from "./evidence-table";
import { useLendingData } from "./use-lending-data";

/** Expired is a fact about the record, not a judgement — say it, do not hide it. */
function windowLine(a: LendingAttestation): string {
  const from = dateOnly(a.effectiveAt);
  const to = a.expiresAt ? dateOnly(a.expiresAt) : "open-ended";
  return `${from} → ${to}`;
}

export function AttestationsView({ attestations }: { attestations: LendingAttestation[] }) {
  const now = Date.now();
  const expired = attestations.filter(
    (a) => a.expiresAt !== null && Date.parse(a.expiresAt) < now
  ).length;

  return (
    <div>
      <LdNote>
        {expired === 0
          ? "Every attestation on this book is inside its window."
          : `${expired} of ${attestations.length} are past their expiry.`}
      </LdNote>
      <EvidenceTable
        rows={attestations}
        emptyLine="No attestations recorded for this book."
        columns={[
          {
            key: "kind",
            header: "Attestation",
            cell: (a) => (
              <>
                {humanize(a.kind) || "—"}
                <CorrectionMark correctsId={a.correctsId} />
              </>
            ),
          },
          { key: "subject", header: "Subject", cell: (a) => a.subject ?? "—" },
          { key: "status", header: "Status", cell: (a) => humanize(a.status) || "—" },
          { key: "window", header: "In force", muted: true, cell: (a) => windowLine(a) },
        ]}
      />
    </div>
  );
}

export const ATTESTATIONS_EXPLAIN: LdExplainCopy = {
  what: "What has been attested about this book and for how long — the standing statements an examiner will ask you to produce.",
  next: "Check nothing in force has quietly passed its expiry.",
  nextWhenEmpty: "Nothing has been attested about this book yet.",
};

export function AttestationsPanel() {
  const load = useCallback((bookId: string) => listAttestations(bookId), []);
  const { state } = useLendingData<LendingAttestation[]>(load);

  return (
    <LdPanelFrame
      title="Attestations"
      subject="attestations"
      state={state}
      explain={ATTESTATIONS_EXPLAIN}
      countOf={(rows) => rows.length}
      render={(attestations) => <AttestationsView attestations={attestations} />}
    />
  );
}
