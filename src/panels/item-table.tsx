import { useEffect, useState } from "react";
import { bus } from "@/bus";
import { getDataProvider, type Item } from "@/data";
import { getVocabulary } from "@/config";
import { useLayout } from "@/shell/layout-context";
import { usePanelScope } from "@/shell/panel-scope";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { List } from "lucide-react";

export function ItemTablePanel() {
  const vocab = getVocabulary();
  const { isPanelVisible, openPanel } = useLayout();
  const { tab } = usePanelScope();
  const [items, setItems] = useState<Item[]>([]);
  const [entityName, setEntityName] = useState<string | null>(null);
  const [currentEntityId, setCurrentEntityId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sortField, setSortField] = useState<"date" | "title" | "status">("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const scopeId = tab.scopeId ?? null;

  useEffect(() => {
    return bus.onScoped("entity.selected", scopeId, (event) => {
      setEntityName(event.entityName);
      setCurrentEntityId(event.entityId);
      setSelectedId(null);
      getDataProvider().listItems(event.entityId).then(setItems);
    });
  }, [scopeId]);

  const sorted = [...items].sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    if (sortField === "date") return dir * a.date.localeCompare(b.date);
    if (sortField === "title") return dir * a.title.localeCompare(b.title);
    return dir * a.status.localeCompare(b.status);
  });

  const handleSort = (field: "date" | "title" | "status") => {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortField(field); setSortDir("desc"); }
  };

  const handleSelect = (item: Item) => {
    setSelectedId(item.id);
    const emitScope = scopeId ?? (currentEntityId ? findScopeForEntity(currentEntityId) : undefined) ?? tab.id;
    bus.emit("item.selected", { scopeId: emitScope, itemId: item.id, itemTitle: item.title, entityId: item.entityId });
    bus.emit("chat.context", {
      scopeId: emitScope,
      entityId: item.entityId,
      entityName: entityName,
      itemId: item.id,
      itemTitle: item.title,
    });
  };

  if (!entityName) {
    const entityListOpen = isPanelVisible("EntityList");
    return (
      <div className="flex h-full items-center justify-center p-4">
        <div className="text-center space-y-3">
          <p className="text-sm text-muted-foreground">
            {entityListOpen
              ? `Select a ${vocab.entity.toLowerCase()} to see their ${vocab.itemPlural.toLowerCase()}.`
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
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-3 py-1.5">
        <p className="text-xs text-muted-foreground">
          {vocab.itemPlural} for <span className="font-medium text-foreground">{entityName}</span>
        </p>
      </div>
      <div className="grid grid-cols-[1fr_90px_80px] gap-2 border-b border-border px-3 py-1.5">
        <button onClick={() => handleSort("title")} className="text-left text-[11px] font-medium text-muted-foreground hover:text-foreground uppercase tracking-wide">
          {vocab.item} {sortField === "title" && (sortDir === "asc" ? "\u2191" : "\u2193")}
        </button>
        <button onClick={() => handleSort("date")} className="text-left text-[11px] font-medium text-muted-foreground hover:text-foreground uppercase tracking-wide">
          Date {sortField === "date" && (sortDir === "asc" ? "\u2191" : "\u2193")}
        </button>
        <button onClick={() => handleSort("status")} className="text-left text-[11px] font-medium text-muted-foreground hover:text-foreground uppercase tracking-wide">
          Status {sortField === "status" && (sortDir === "asc" ? "\u2191" : "\u2193")}
        </button>
      </div>
      <ScrollArea className="flex-1">
        <div className="divide-y divide-border">
          {sorted.map((item) => (
            <button
              key={item.id}
              onClick={() => handleSelect(item)}
              className={`
                w-full grid grid-cols-[1fr_90px_80px] gap-2 px-3 py-2 text-left transition-colors
                ${selectedId === item.id ? "bg-accent" : "hover:bg-accent/50"}
              `}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{item.title}</p>
                <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{item.type}</p>
              </div>
              <span className="self-center text-xs text-muted-foreground font-mono tabular-nums">{item.date}</span>
              <Badge variant="secondary" className="self-center text-[10px] w-fit">
                {item.status}
              </Badge>
            </button>
          ))}
        </div>
        {items.length === 0 && (
          <p className="p-4 text-center text-xs text-muted-foreground">No {vocab.itemPlural.toLowerCase()} found.</p>
        )}
      </ScrollArea>
    </div>
  );
}

function findScopeForEntity(_entityId: string): string | undefined {
  return undefined;
}
