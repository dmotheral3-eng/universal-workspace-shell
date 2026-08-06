import { useEffect, useState } from "react";
import { bus } from "@/bus";
import { getDataProvider, type Stage } from "@/data";
import { getVocabulary } from "@/config";
import { useLayout } from "@/shell/layout-context";
import { usePanelScope } from "@/shell/panel-scope";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Check, Circle, Clock, AlertTriangle, List } from "lucide-react";

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

  if (!entityName) {
    const entityListOpen = isPanelVisible("EntityList");
    return (
      <div className="flex h-full items-center justify-center p-4">
        <div className="text-center space-y-3">
          <p className="text-sm text-muted-foreground">
            {entityListOpen
              ? `Select a ${vocab.entity.toLowerCase()} to view progress stages.`
              : `The ${vocab.entityPlural} panel is closed.`
            }
          </p>
          {!entityListOpen && (
            <button
              onClick={() => openPanel("EntityList")}
              className="inline-flex items-center gap-1.5 rounded border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent transition-colors"
            >
              <List className="h-3.5 w-3.5" />
              Open {vocab.entityPlural}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-4">
        <p className="mb-4 text-xs text-muted-foreground">
          Progress for <span className="font-medium text-foreground">{entityName}</span>
        </p>
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
      </div>
    </ScrollArea>
  );
}
