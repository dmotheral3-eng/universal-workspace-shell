import { useEffect, useState } from "react";
import { bus } from "@/bus";
import { getDataProvider, type Stage } from "@/data";
import { getVocabulary } from "@/config";
import { useLayout } from "@/shell/layout-context";
import { usePanelScope } from "@/shell/panel-scope";
import { Check, Circle, Clock, AlertTriangle, List } from "lucide-react";
import { ExplainScreen, PrimaryAction, ProgressStrip } from "./explain";

const stateConfig = {
  done: { icon: Check, className: "bg-primary text-primary-foreground", lineClass: "bg-primary" },
  current: { icon: Clock, className: "bg-ring text-primary-foreground", lineClass: "bg-ring" },
  pending: { icon: Circle, className: "bg-muted text-muted-foreground", lineClass: "bg-border" },
  blocked: { icon: AlertTriangle, className: "bg-destructive text-destructive-foreground", lineClass: "bg-destructive/30" },
};

export function StageTrackerPanel() {
  const vocab = getVocabulary();
  const { isPanelVisible, openPanel } = useLayout();
  const { tab } = usePanelScope();
  const [stages, setStages] = useState<Stage[]>([]);
  const [entityName, setEntityName] = useState<string | null>(null);

  const scopeId = tab.scopeId ?? null;

  useEffect(() => {
    setEntityName(null);
    setStages([]);
  }, [scopeId]);

  useEffect(() => {
    return bus.onScoped("entity.selected", scopeId, async (event) => {
      setEntityName(event.entityName);
      const s = await getDataProvider().getStages(event.entityId);
      setStages(s);
    });
  }, [scopeId]);

  const one = vocab.entity.toLowerCase();

  if (!entityName) {
    const entityListOpen = isPanelVisible("EntityList");
    return (
      <ExplainScreen
        explain={{
          title: "Where things stand",
          what: `The stages a ${one} moves through from start to finish, and which one it is sitting in right now.`,
          where: `No ${one} is open, so there is no position to report.`,
          next: entityListOpen
            ? `Pick a ${one} from the ${vocab.entityPlural} list.`
            : `The ${vocab.entityPlural} list is closed — open it and pick a ${one}.`,
          action: entityListOpen ? undefined : (
            <PrimaryAction
              label={`Open ${vocab.entityPlural}`}
              icon={List}
              onClick={() => openPanel("EntityList")}
            />
          ),
        }}
      >
        <p className="p-4 text-[13px] text-muted-foreground">
          Nothing to show until a {one} is chosen.
        </p>
      </ExplainScreen>
    );
  }

  const blocked = stages.find((s) => s.state === "blocked");
  const current = stages.find((s) => s.state === "current");
  const doneCount = stages.filter((s) => s.state === "done").length;

  return (
    <ExplainScreen
      explain={{
        title: "Where things stand",
        what: `The stages this ${one} moves through from start to finish. Green is finished, blue is where you are now, grey is still ahead.`,
        where: blocked
          ? `Blocked at “${blocked.name}”${blocked.detail ? ` — ${blocked.detail}` : ""}.`
          : current
            ? `In “${current.name}”${current.detail ? ` — ${current.detail}` : ""}.`
            : stages.length > 0 && doneCount === stages.length
              ? "Every recorded stage is finished."
              : "Not started — the first stage is still open.",
        next: blocked
          ? `Clear whatever is holding up “${blocked.name}”.`
          : current
            ? `Finish “${current.name}”, then the next stage opens.`
            : "Nothing is in flight. Nothing is waiting on you here.",
        orientation: (
          <ProgressStrip
            steps={stages.map((s) => ({ id: s.id, label: s.name, state: s.state, detail: s.detail }))}
          />
        ),
      }}
    >
      <div className="p-4">
        <div className="space-y-0">
          {stages.map((stage, index) => {
            const cfg = stateConfig[stage.state];
            const Icon = cfg.icon;
            const isLast = index === stages.length - 1;
            return (
              <div key={stage.id} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className={`flex h-6 w-6 items-center justify-center rounded-full ${cfg.className}`}>
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  {!isLast && <div className={`w-0.5 flex-1 min-h-[24px] ${cfg.lineClass}`} />}
                </div>
                <div className="pb-4">
                  <p className={`text-sm font-medium ${stage.state === "pending" ? "text-muted-foreground" : "text-foreground"}`}>
                    {stage.name}
                  </p>
                  {stage.detail && (
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{stage.detail}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {stages.length === 0 && (
          <p className="text-[13px] text-muted-foreground">
            No stages recorded for {entityName} yet.
          </p>
        )}
      </div>
    </ExplainScreen>
  );
}
