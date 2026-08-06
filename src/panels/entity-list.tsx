import { useEffect, useState, useMemo } from "react";
import { bus } from "@/bus";
import { getDataProvider, type Entity } from "@/data";
import { getVocabulary } from "@/config";
import { usePanelScope } from "@/shell/panel-scope";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search } from "lucide-react";

export function EntityListPanel() {
  const vocab = getVocabulary();
  const { tab } = usePanelScope();
  const [entities, setEntities] = useState<Entity[]>([]);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    getDataProvider().listEntities().then(setEntities);
  }, []);

  const filtered = useMemo(() => {
    if (!search) return entities;
    const lower = search.toLowerCase();
    return entities.filter(
      (e) =>
        e.name.toLowerCase().includes(lower) ||
        e.subtitle.toLowerCase().includes(lower) ||
        e.tags.some((t) => t.toLowerCase().includes(lower))
    );
  }, [entities, search]);

  const handleSelect = (entity: Entity) => {
    setSelectedId(entity.id);
    const scopeId = tab.id;
    bus.emit("entity.selected", { scopeId, entityId: entity.id, entityName: entity.name });
    bus.emit("chat.context", {
      scopeId,
      entityId: entity.id,
      entityName: entity.name,
      itemId: null,
      itemTitle: null,
    });
  };

  if (entities.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <p className="text-sm text-muted-foreground">Loading {vocab.entityPlural.toLowerCase()}...</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border p-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${vocab.entityPlural.toLowerCase()}...`}
            className="h-7 pl-7 text-xs"
          />
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-1">
          {filtered.map((entity) => (
            <button
              key={entity.id}
              onClick={() => handleSelect(entity)}
              className={`
                w-full rounded px-2.5 py-2 text-left transition-colors
                ${selectedId === entity.id ? "bg-accent text-accent-foreground" : "hover:bg-accent/50"}
              `}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium leading-tight">{entity.name}</span>
                <Badge variant="secondary" className="ml-2 text-[10px] font-normal">
                  {entity.status}
                </Badge>
              </div>
              <p className="mt-0.5 text-[11px] text-muted-foreground font-mono">{entity.subtitle}</p>
              {entity.tags.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {entity.tags.map((tag) => (
                    <span key={tag} className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="p-4 text-center text-xs text-muted-foreground">No {vocab.entityPlural.toLowerCase()} match your search.</p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
