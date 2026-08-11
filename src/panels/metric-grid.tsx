import { useEffect, useState } from "react";
import { bus } from "@/bus";
import { getDataProvider, type Metric } from "@/data";
import { getVocabulary } from "@/config";
import { useLayout } from "@/shell/layout-context";
import { usePanelScope } from "@/shell/panel-scope";
import { TrendingDown, TrendingUp, Minus, List } from "lucide-react";
import { ExplainScreen, PrimaryAction } from "./explain";

export function MetricGridPanel() {
  const vocab = getVocabulary();
  const { isPanelVisible, openPanel } = useLayout();
  const { tab } = usePanelScope();
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [entityName, setEntityName] = useState<string | null>(null);

  const scopeId = tab.scopeId ?? null;

  useEffect(() => {
    setEntityName(null);
    setMetrics([]);
  }, [scopeId]);

  useEffect(() => {
    return bus.onScoped("entity.selected", scopeId, async (event) => {
      setEntityName(event.entityName);
      const m = await getDataProvider().getMetrics(event.entityId);
      setMetrics(m);
    });
  }, [scopeId]);

  const one = vocab.entity.toLowerCase();

  if (!entityName) {
    const entityListOpen = isPanelVisible("EntityList");
    return (
      <ExplainScreen
        explain={{
          title: "The numbers",
          what: `How much of everything there is in a ${one} — counted from the record, not estimated.`,
          where: `No ${one} is open, so there is nothing to count.`,
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

  return (
    <ExplainScreen
      explain={{
        title: "The numbers",
        what: `How much of everything there is in this ${one}. Every figure is a count of real rows — nothing here is projected or filled in.`,
        where: (
          <>
            {metrics.length} {metrics.length === 1 ? "figure" : "figures"} for{" "}
            <span className="font-medium">{entityName}</span>.
          </>
        ),
        next: "Read these as a size check. To act on any of them, open the panel that holds the underlying rows.",
      }}
    >
      <div className="grid gap-2 p-4 [grid-template-columns:repeat(auto-fill,minmax(160px,1fr))]">
        {metrics.map((metric) => (
          <div key={metric.id} className="rounded border border-border p-3">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wide">{metric.label}</p>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-lg font-semibold font-mono tabular-nums">{metric.value}</span>
              {metric.delta && (
                <span className={`flex items-center gap-0.5 text-[11px] font-mono ${
                  metric.deltaDirection === "down" ? "text-emerald-600 dark:text-emerald-400" :
                  metric.deltaDirection === "up" ? "text-amber-600 dark:text-amber-400" :
                  "text-muted-foreground"
                }`}>
                  {metric.deltaDirection === "down" && <TrendingDown className="h-3 w-3" />}
                  {metric.deltaDirection === "up" && <TrendingUp className="h-3 w-3" />}
                  {metric.deltaDirection === "neutral" && <Minus className="h-3 w-3" />}
                  {metric.delta}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </ExplainScreen>
  );
}
