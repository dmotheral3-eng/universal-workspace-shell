import { useCallback } from "react";
import type { LdRate, LawDogProvider } from "@/data/lawdog-provider";
import { listRateCardViaBroker } from "@/data/cube-broker";
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

/**
 * PROOF SURFACE for the brokered door (D-SHELLAUTH-1).
 *
 * The same panel, rendered from either door and identical on screen:
 *   lawdog profile → the provider talks to Law Dog's project with the user's own token
 *   cube profile   → /api/cube/rate_card, where the server holds the Cube
 *                    credential and applies the tenant filter
 *
 * The rate card is the honest test of the broker because it is tenant-level and
 * carries no case_id: tenant scoping is the only thing separating one
 * workspace's rates from another's.
 */
export function RatesPanel() {
  const load = useCallback((provider: LawDogProvider) => provider.listRateCard(), []);
  const brokerLoad = useCallback(() => listRateCardViaBroker(), []);
  // No entity required: the rate card has no case_id and row security scopes it.
  const { state } = useLegalData<LdRate[]>(load, { requiresEntity: false, brokerLoad });

  return (
    <LdPanelFrame
      title="Rates"
      subject="rates"
      state={state}
      render={(rates) => <RatesView rates={rates} />}
    />
  );
}
