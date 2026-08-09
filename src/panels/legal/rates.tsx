import { useCallback } from "react";
import type { LdRate, LawDogProvider } from "@/data/lawdog-provider";
import { LD, LdEmpty, LdNote, humanize, money } from "./ld-kit";
import { LdPanelFrame } from "./ld-panel-frame";
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

export function RatesPanel() {
  const load = useCallback((provider: LawDogProvider) => provider.listRateCard(), []);
  // No entity required: the rate card has no case_id and row security scopes it.
  const { state } = useLegalData<LdRate[]>(load, { requiresEntity: false });

  return (
    <LdPanelFrame
      title="Rates"
      subject="rates"
      state={state}
      render={(rates) => <RatesView rates={rates} />}
    />
  );
}
