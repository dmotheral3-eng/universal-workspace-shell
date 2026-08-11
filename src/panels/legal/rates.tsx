import { useCallback } from "react";
import type { LdRate, LawDogProvider } from "@/data/lawdog-provider";
import { LD, LdEmpty, LdNote, humanize, money } from "./ld-kit";
import { LdPanelFrame, type LdExplainCopy } from "./ld-panel-frame";
import { useLegalData } from "./use-legal-data";

export function RatesView({ rates }: { rates: LdRate[] }) {
  if (rates.length === 0) {
    return <LdEmpty line="No rates recorded." />;
  }

  return (
    <div>
      {/* The rate card is tenant-level — it carries no case column, so it does not
          narrow with the selected matter. Say so rather than let it look stale. */}
      <LdNote>Rates apply across the workspace, not to one matter.</LdNote>
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="border-y" style={{ borderColor: LD.hairline, background: LD.wash }}>
            <th className="px-3 py-1.5 text-left font-medium">Role</th>
            <th className="px-3 py-1.5 text-right font-medium">Hourly rate</th>
            <th className="px-3 py-1.5 text-left font-medium">Locale</th>
            <th className="px-3 py-1.5 text-left font-medium">Basis</th>
          </tr>
        </thead>
        <tbody>
          {rates.map((r) => (
            <tr key={r.id} className="border-b" style={{ borderColor: LD.hairline }}>
              <td className="px-3 py-1.5">{humanize(r.role) || "—"}</td>
              <td className="px-3 py-1.5 text-right font-mono tabular-nums">
                {money(r.hourlyRate)}
              </td>
              <td className="px-3 py-1.5" style={{ color: LD.inkMuted }}>
                {r.locale ?? "—"}
              </td>
              <td className="px-3 py-1.5" style={{ color: LD.inkMuted }}>
                {humanize(r.basis) || "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Explain-first copy for this panel (ruling 2026-08-10). Exported so the fixture
 *  harness renders the same words the app does. */
export const RATES_EXPLAIN: LdExplainCopy = {
  what: "What an hour of each role costs. These rates are what every savings and cost figure elsewhere is built from.",
  next: "Confirm a rate here before quoting any cost figure to a client.",
  nextWhenEmpty: "Set the rate card — cost and savings figures elsewhere have nothing to multiply by until you do.",
};

export function RatesPanel() {
  const load = useCallback((provider: LawDogProvider) => provider.listRateCard(), []);
  // No entity required: the rate card has no case_id and row security scopes it.
  const { state } = useLegalData<LdRate[]>(load, { requiresEntity: false });

  return (
    <LdPanelFrame
      title="Rates"
      subject="rates"
      state={state}
      explain={RATES_EXPLAIN}
      countOf={(rows) => rows.length}
      render={(rates) => <RatesView rates={rates} />}
    />
  );
}
