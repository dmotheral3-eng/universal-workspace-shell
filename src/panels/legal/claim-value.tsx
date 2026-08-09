import { useCallback } from "react";
import type { LdClaimGroup, LawDogProvider } from "@/data/lawdog-provider";
import { LD, LdEmpty, LdJson, LdNote, money } from "./ld-kit";
import { LdPanelFrame } from "./ld-panel-frame";
import { useLegalData } from "./use-legal-data";

function Figure({ label, value, strong }: { label: string; value: number | null; strong?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px]" style={{ color: LD.inkFaint }}>
        {label}
      </span>
      <span
        className={`font-mono tabular-nums ${strong ? "text-[15px] font-medium" : "text-[13px]"}`}
        style={{ color: strong ? LD.ink : LD.inkMuted }}
      >
        {money(value)}
      </span>
    </div>
  );
}

export function ClaimValueView({ groups }: { groups: LdClaimGroup[] }) {
  if (groups.length === 0) {
    return <LdEmpty line="No claim value recorded." />;
  }

  return (
    <div>
      {/* Claim math keys on claim_id and carries no case column, so this is the
          whole workspace's claim set. It narrows to the selected matter once the
          claim→case join is available. */}
      <LdNote>Grouped by claim across the workspace.</LdNote>
      {groups.map((group) => {
        const latest = group.rows[0];
        return (
          <section
            key={group.claimId}
            className="border-b px-3 py-2.5"
            style={{ borderColor: LD.hairline }}
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="truncate font-mono text-[12px]" style={{ color: LD.inkMuted }}>
                {group.claimId}
              </span>
              {group.rows.length > 1 ? (
                <span className="text-[11px]" style={{ color: LD.inkFaint }}>
                  {group.rows.length} calculations · latest shown
                </span>
              ) : null}
            </div>

            {latest ? (
              <>
                <div className="mt-2 flex flex-wrap gap-6">
                  <Figure label="Low" value={latest.amountLow} />
                  <Figure label="Target" value={latest.amountTarget} strong />
                  <Figure label="High" value={latest.amountHigh} />
                </div>

                <div className="mt-2">
                  <LdJson value={latest.lineItems} emptyLine="No line items." />
                </div>

                {latest.methodology ? (
                  <p className="mt-2 text-[12px]" style={{ color: LD.inkFaint }}>
                    {latest.methodology}
                  </p>
                ) : null}
              </>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}

export function ClaimValuePanel() {
  const load = useCallback((provider: LawDogProvider) => provider.listClaimMath(), []);
  // No entity required: ld_claim_math has no case_id to filter on.
  const { state } = useLegalData<LdClaimGroup[]>(load, { requiresEntity: false });

  return (
    <LdPanelFrame
      title="Claim value"
      subject="claim value"
      state={state}
      render={(groups) => <ClaimValueView groups={groups} />}
    />
  );
}
