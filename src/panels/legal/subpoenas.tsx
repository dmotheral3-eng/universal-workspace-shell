import { useCallback } from "react";
import type { LdSubpoena, LawDogProvider } from "@/data/lawdog-provider";
import { LD, LdEmpty, LdEnumPill, dateOnly, humanize, moneyRange } from "./ld-kit";
import { LdPanelFrame } from "./ld-panel-frame";
import { useLegalData } from "./use-legal-data";

function Block({ label, text }: { label: string; text: string }) {
  return (
    <div className="min-w-0 flex-1">
      <p className="text-[11px] font-medium" style={{ color: LD.inkFaint }}>
        {label}
      </p>
      <p className="mt-0.5 text-[12px] break-words" style={{ color: LD.inkMuted }}>
        {text}
      </p>
    </div>
  );
}

export function SubpoenasView({ rows }: { rows: LdSubpoena[] }) {
  if (rows.length === 0) {
    return <LdEmpty line="No subpoenas recorded." />;
  }

  // subpoena_no is the working citation order; nulls sink to the end.
  const ordered = [...rows].sort(
    (a, b) => (a.subpoenaNo ?? Number.MAX_SAFE_INTEGER) - (b.subpoenaNo ?? Number.MAX_SAFE_INTEGER)
  );

  return (
    <ul className="flex flex-col gap-2 p-3">
      {ordered.map((s) => (
        <li
          key={s.id}
          className="rounded-[6px] border p-3"
          style={{ borderColor: LD.hairline, background: LD.ground }}
        >
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-[12px] tabular-nums" style={{ color: LD.inkFaint }}>
              {s.subpoenaNo === null ? "—" : `#${s.subpoenaNo}`}
            </span>
            <span className="font-medium">{s.target ?? "Unnamed target"}</span>
            {s.targetType ? (
              <span className="text-[12px]" style={{ color: LD.inkMuted }}>
                {humanize(s.targetType)}
              </span>
            ) : null}
            <span className="ml-auto flex items-center gap-1.5">
              <LdEnumPill value={s.priority} kind="priority" />
              <LdEnumPill value={s.status} kind="status" />
            </span>
          </div>

          {s.whatItGets || s.whatItProves ? (
            <div className="mt-2 flex flex-wrap gap-4">
              {s.whatItGets ? <Block label="What it gets" text={s.whatItGets} /> : null}
              {s.whatItProves ? <Block label="What it proves" text={s.whatItProves} /> : null}
            </div>
          ) : null}

          {s.legalImpact ? (
            <p className="mt-2 text-[12px]" style={{ color: LD.inkFaint }}>
              {s.legalImpact}
            </p>
          ) : null}

          <div
            className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-2 text-[12px]"
            style={{ borderColor: LD.hairline, color: LD.inkMuted }}
          >
            <span>
              Est. cost{" "}
              <span className="font-mono tabular-nums">
                {moneyRange(s.estCostLow, s.estCostHigh)}
              </span>
            </span>
            {s.jurisdiction ? <span>{s.jurisdiction}</span> : null}
            {s.filingDay ? <span>Filing day {s.filingDay}</span> : null}
            <span>Filed {dateOnly(s.filedDate)}</span>
            <span>Response {dateOnly(s.responseDate)}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function SubpoenasPanel() {
  const load = useCallback(
    (provider: LawDogProvider, entityId: string | null) => provider.listSubpoenas(entityId ?? ""),
    []
  );
  const { state, entityName } = useLegalData<LdSubpoena[]>(load);

  return (
    <LdPanelFrame
      title="Subpoenas"
      subject="subpoenas"
      meta={entityName}
      state={state}
      render={(rows) => <SubpoenasView rows={rows} />}
    />
  );
}
