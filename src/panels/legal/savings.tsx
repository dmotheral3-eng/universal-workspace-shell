import { useCallback } from "react";
import type { LdSaving, LawDogProvider } from "@/data/lawdog-provider";
import { LD, LdEmpty, LdFooter, LdPill, dateOnly, hours, humanize, money, rate } from "./ld-kit";
import { LdPanelFrame, type LdExplainCopy } from "./ld-panel-frame";
import { useLegalData } from "./use-legal-data";

export function savingsTotal(rows: LdSaving[]): number {
  return rows.reduce((sum, r) => sum + (r.dollarsSaved ?? 0), 0);
}

export function estimatedCount(rows: LdSaving[]): number {
  return rows.filter((r) => r.isEstimate).length;
}

export function SavingsView({ rows }: { rows: LdSaving[] }) {
  if (rows.length === 0) {
    return <LdEmpty line="No savings recorded." />;
  }

  return (
    <ul>
      {rows.map((r) => {
        // A row with no hours and no rate says so by omission rather than by a
        // line of dashes.
        const detail = [
          r.hoursDisplaced === null ? null : hours(r.hoursDisplaced),
          r.rateUsed === null ? null : rate(r.rateUsed),
          r.occurredAt ? dateOnly(r.occurredAt) : null,
        ].filter(Boolean);
        return (
          <li key={r.id} className="border-b px-3 py-2" style={{ borderColor: LD.hairline }}>
            <div className="flex items-baseline justify-between gap-3">
              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                <span className="font-medium">
                  {r.actionLabel ?? (humanize(r.actionKey) || "Unlabelled action")}
                </span>
                {/* An estimate must never read as a booked figure. */}
                {r.isEstimate ? <LdPill label="Estimate" tone="attention" /> : null}
              </div>
              <span className="font-mono tabular-nums">{money(r.dollarsSaved)}</span>
            </div>
            {detail.length > 0 ? (
              <p className="mt-0.5 text-[12px]" style={{ color: LD.inkMuted }}>
                {detail.join(" · ")}
              </p>
            ) : null}
            {r.isEstimate && r.estimateBasis ? (
              <p className="mt-0.5 text-[12px]" style={{ color: LD.inkFaint }}>
                Basis: {r.estimateBasis}
              </p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

export function SavingsFooter({ rows }: { rows: LdSaving[] }) {
  const estimates = estimatedCount(rows);
  return (
    <LdFooter>
      <span style={{ color: LD.inkMuted }}>
        Total{estimates > 0 ? ` · ${estimates} of ${rows.length} estimated` : ""}
      </span>
      <span className="font-mono font-medium tabular-nums">{money(savingsTotal(rows))}</span>
    </LdFooter>
  );
}

/** Explain-first copy for this panel (ruling 2026-08-10). Exported so the fixture
 *  harness renders the same words the app does. */
export const SAVINGS_EXPLAIN: LdExplainCopy = {
  what: "Work the system did instead of a person, priced at the rate that person would have charged.",
  next: "Treat anything marked as an estimate as an estimate — the total below says how many there are.",
  nextWhenEmpty: "Nothing has been displaced on this matter yet.",
};

export function SavingsPanel() {
  const load = useCallback(
    (provider: LawDogProvider, entityId: string | null) => provider.listSavings(entityId ?? ""),
    []
  );
  const { state, entityName } = useLegalData<LdSaving[]>(load);

  return (
    <LdPanelFrame
      title="Savings"
      subject="savings"
      meta={entityName}
      state={state}
      explain={SAVINGS_EXPLAIN}
      countOf={(rows) => rows.length}
      render={(rows) => <SavingsView rows={rows} />}
      footer={(rows) => (rows.length > 0 ? <SavingsFooter rows={rows} /> : null)}
    />
  );
}
