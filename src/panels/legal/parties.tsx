import { useCallback } from "react";
import { groupPartiesByRole, type LdParty, type LawDogProvider } from "@/data/lawdog-provider";
import { LD, LdEmpty, LdPill, humanize } from "./ld-kit";
import { LdPanelFrame } from "./ld-panel-frame";
import { useLegalData } from "./use-legal-data";

/** Pure view — rendered by the panel and by the fixture harness. */
export function PartiesView({ parties }: { parties: LdParty[] }) {
  if (parties.length === 0) {
    return <LdEmpty line="No parties recorded." />;
  }

  return (
    <div>
      {groupPartiesByRole(parties).map((group) => (
        <section key={group.role}>
          <div
            className="sticky top-0 flex items-baseline justify-between border-b px-3 py-1.5"
            style={{ borderColor: LD.hairline, background: LD.wash }}
          >
            <span className="text-[12px] font-medium">{humanize(group.role)}</span>
            <span className="font-mono text-[11px] tabular-nums" style={{ color: LD.inkFaint }}>
              {group.parties.length}
            </span>
          </div>
          <ul>
            {group.parties.map((p) => {
              const counsel = [p.counselName, p.counselBarNo, p.counselEmail].filter(Boolean);
              return (
                <li
                  key={p.id}
                  className="border-b px-3 py-2"
                  style={{ borderColor: LD.hairline }}
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-medium">{p.name}</span>
                    {p.isClient ? <LdPill label="Client" tone="positive" /> : null}
                    {p.entityType ? <LdPill label={humanize(p.entityType)} /> : null}
                  </div>
                  {counsel.length > 0 ? (
                    <p className="mt-0.5 text-[12px]" style={{ color: LD.inkMuted }}>
                      {counsel.join(" · ")}
                    </p>
                  ) : null}
                  {p.notes ? (
                    <p className="mt-0.5 text-[12px]" style={{ color: LD.inkFaint }}>
                      {p.notes}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

export function PartiesPanel() {
  const load = useCallback(
    (provider: LawDogProvider, entityId: string | null) => provider.listParties(entityId ?? ""),
    []
  );
  const { state, entityName } = useLegalData<LdParty[]>(load);

  return (
    <LdPanelFrame
      title="Parties"
      subject="parties"
      meta={entityName}
      state={state}
      render={(parties) => <PartiesView parties={parties} />}
    />
  );
}
