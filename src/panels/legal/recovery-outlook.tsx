import { useCallback } from "react";
import type { LdRecoveryMath, LawDogProvider } from "@/data/lawdog-provider";
import { LD, LdAccentFigure, LdEmpty, LdJson, dateTime, money, moneyRange } from "./ld-kit";
import { LdPanelFrame } from "./ld-panel-frame";
import { useLegalData } from "./use-legal-data";

export function RecoveryOutlookView({ rows }: { rows: LdRecoveryMath[] }) {
  if (rows.length === 0) {
    return <LdEmpty line="No recovery outlook recorded." />;
  }

  const [latest, ...earlier] = rows;

  return (
    <div className="p-3">
      {/* The mid figure is the headline, and it is the single accented element
          across all six panels. See the ruling in ld-kit.tsx. */}
      <div className="flex flex-col gap-1">
        <span className="text-[11px]" style={{ color: LD.inkFaint }}>
          Combined mid
        </span>
        <LdAccentFigure>{money(latest.combinedMid)}</LdAccentFigure>
        <span className="font-mono text-[12px] tabular-nums" style={{ color: LD.inkMuted }}>
          {moneyRange(latest.combinedLow, latest.combinedHigh)}
        </span>
      </div>

      <div className="mt-3 border-t pt-2" style={{ borderColor: LD.hairline }}>
        <p className="text-[11px] font-medium" style={{ color: LD.inkFaint }}>
          Breakdown
        </p>
        <div className="mt-1">
          <LdJson value={latest.breakdown} emptyLine="No breakdown recorded." />
        </div>
      </div>

      {latest.methodology ? (
        <p className="mt-2 text-[12px]" style={{ color: LD.inkFaint }}>
          {latest.methodology}
        </p>
      ) : null}

      <p className="mt-3 text-[12px]" style={{ color: LD.inkMuted }}>
        Last calculated {dateTime(latest.lastCalculated ?? latest.createdAt)}
      </p>

      {earlier.length > 0 ? (
        <p className="mt-1 text-[12px]" style={{ color: LD.inkFaint }}>
          {earlier.length} earlier {earlier.length === 1 ? "calculation" : "calculations"} on file.
        </p>
      ) : null}
    </div>
  );
}

export function RecoveryOutlookPanel() {
  const load = useCallback(
    (provider: LawDogProvider, entityId: string | null) =>
      provider.listRecoveryMath(entityId ?? ""),
    []
  );
  const { state, entityName } = useLegalData<LdRecoveryMath[]>(load);

  return (
    <LdPanelFrame
      title="Recovery outlook"
      subject="the recovery outlook"
      meta={entityName}
      state={state}
      render={(rows) => <RecoveryOutlookView rows={rows} />}
    />
  );
}
