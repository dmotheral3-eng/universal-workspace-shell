import { useEffect, useState } from "react";
import { bus } from "@/bus";
import { getDataProvider, type Item } from "@/data";
import { getVocabulary } from "@/config";
import { useLayout } from "@/shell/layout-context";
import { usePanelScope } from "@/shell/panel-scope";
import { List, ArrowDown } from "lucide-react";
import {
  Chip,
  ExplainScreen,
  PrimaryAction,
  humanizeStatus,
  statusTone,
} from "./explain";

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

  const one = vocab.entity.toLowerCase();
  const many = vocab.itemPlural.toLowerCase();

  // Explain-first: this block renders above the table in every state (ruling
  // 2026-08-10). The table is never the first thing a reader meets.
  if (!entityName) {
    const entityListOpen = isPanelVisible("EntityList");
    return (
      <ExplainScreen
        explain={{
          title: vocab.itemPlural,
          what: `Everything that happened in this ${one}, in the order it happened. Each line opens in full when you click it.`,
          where: `No ${one} is open, so there is nothing to put in order yet.`,
          next: entityListOpen
            ? `Pick a ${one} from the ${vocab.entityPlural} list.`
            : `The ${vocab.entityPlural} list is closed \u2014 open it and pick a ${one}.`,
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

  const newest = sorted.length > 0 ? [...items].sort((a, b) => b.date.localeCompare(a.date))[0] : null;

  return (
    <ExplainScreen
      explain={{
        title: vocab.itemPlural,
        what: `Everything that happened in this ${one}, in the order it happened. Sort by any column; click a line to read it in full.`,
        where: (
          <>
            {items.length} {items.length === 1 ? "entry" : "entries"} recorded for{" "}
            <span className="font-medium">{entityName}</span>
            {newest ? `, the most recent on ${newest.date}.` : "."}
          </>
        ),
        next: selectedId
          ? "Open another line, or sort by date to see what has been quiet longest."
          : `Click any line to read it, or start with the most recent ${vocab.item.toLowerCase()}.`,
        action: newest ? (
          <PrimaryAction
            label="Read the most recent entry"
            icon={ArrowDown}
            onClick={() => handleSelect(newest)}
          />
        ) : undefined,
      }}
    >
      <div className="sticky top-0 z-10 grid grid-cols-[1fr_100px_110px] gap-2 border-b border-border bg-background px-4 py-1.5">
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
      <div className="divide-y divide-border">
        {sorted.map((item) => (
          <button
            key={item.id}
            onClick={() => handleSelect(item)}
            className={`
              w-full grid grid-cols-[1fr_100px_110px] items-center gap-2 px-4 py-2 text-left transition-colors
              ${selectedId === item.id ? "bg-accent" : "hover:bg-accent/50"}
            `}
          >
            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium">{item.title}</p>
              <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{item.type}</p>
            </div>
            <span className="text-xs text-muted-foreground font-mono tabular-nums">{item.date}</span>
            {item.status ? (
              <Chip label={humanizeStatus(item.status)} tone={statusTone(item.status)} />
            ) : (
              <span />
            )}
          </button>
        ))}
      </div>
      {items.length === 0 && (
        <p className="p-4 text-[13px] text-muted-foreground">
          No {many} recorded for {entityName} yet.
        </p>
      )}
    </ExplainScreen>
  );
}

function findScopeForEntity(_entityId: string): string | undefined {
  return undefined;
}
