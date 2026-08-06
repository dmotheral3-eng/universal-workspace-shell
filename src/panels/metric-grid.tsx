import { useEffect, useState } from "react";
import { bus } from "@/bus";
import { getDataProvider, type Metric } from "@/data";
import { getVocabulary } from "@/config";
import { useLayout } from "@/shell/layout-context";
import { usePanelScope } from "@/shell/panel-scope";
import { TrendingDown, TrendingUp, Minus, List } from "lucide-react";

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

  if (!entityName) {
    const entityListOpen = isPanelVisible("EntityList");
    return (
      <div className="flex h-full items-center justify-center p-4">
        <div className="text-center space-y-3">
          <p className="text-sm text-muted-foreground">
            {entityListOpen
              ? `Select a ${vocab.entity.toLowerCase()} to view key metrics.`
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
    <div className="h-full p-3">
      <p className="mb-3 text-xs text-muted-foreground">
        Metrics for <span className="font-medium text-foreground">{entityName}</span>
      </p>
      <div className="grid grid-cols-2 gap-2">
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
    </div>
  );
}
