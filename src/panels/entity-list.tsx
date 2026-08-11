import { useEffect, useState, useMemo } from "react";
import { bus } from "@/bus";
import { getDataProvider, type Entity } from "@/data";
import { getVocabulary } from "@/config";
import { useLayout } from "@/shell/layout-context";
import { usePanelScope } from "@/shell/panel-scope";
import { Input } from "@/components/ui/input";
import { Search, FolderOpen, ArrowRight } from "lucide-react";
import {
  Chip,
  ExplainScreen,
  PrimaryAction,
  humanizeStatus,
  statusTone,
} from "./explain";

/**
 * The list of matters, as cards.
 *
 * Explain-first (ruling 2026-08-10): the header block says what this screen is,
 * which matter is open, and what to do next. The searchable card grid renders
 * below it — never above.
 */
export function EntityListPanel() {
  const vocab = getVocabulary();
  const { tab } = usePanelScope();
  const { openPanel, isPanelVisible } = useLayout();
  const [entities, setEntities] = useState<Entity[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Entity | null>(null);

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
    setSelected(entity);
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

  const one = vocab.entity.toLowerCase();
  const many = vocab.entityPlural.toLowerCase();

  // The primary action changes with the state of the screen, because "what to do
  // next" is different before and after something is picked.
  const action = selected ? (
    <PrimaryAction
      label={`Open ${selected.name}`}
      icon={ArrowRight}
      onClick={() => {
        if (!isPanelVisible("MatterHome")) openPanel("MatterHome");
        handleSelect(selected);
      }}
    />
  ) : (
    <PrimaryAction
      label={`Open the most recent ${one}`}
      icon={FolderOpen}
      disabled={entities.length === 0}
      onClick={() => {
        const first = entities[0];
        if (!first) return;
        if (!isPanelVisible("MatterHome")) openPanel("MatterHome");
        handleSelect(first);
      }}
    />
  );

  return (
    <ExplainScreen
      explain={{
        title: vocab.entityPlural,
        what: `Every ${one} you are working on. Pick one and the rest of the workspace follows it — the evidence, the timeline, the people and the money all switch to that ${one}.`,
        where:
          entities.length === 0
            ? `Loading your ${many}…`
            : selected
              ? <>You have <span className="font-medium">{selected.name}</span> open.</>
              : `Nothing open yet. There ${entities.length === 1 ? "is" : "are"} ${entities.length} ${entities.length === 1 ? one : many} to choose from.`,
        next: selected
          ? `Everything below is about ${selected.name}. Pick a different card to switch.`
          : `Pick a ${one} below to open it.`,
        action,
      }}
    >
      <div className="border-b border-border px-4 py-2.5">
        <div className="relative max-w-sm">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${many} by name, number or party…`}
            className="h-8 pl-8 text-[13px]"
          />
        </div>
      </div>

      <div className="grid gap-3 p-4 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
        {filtered.map((entity) => {
          const isOpen = selected?.id === entity.id;
          return (
            <button
              key={entity.id}
              type="button"
              onClick={() => handleSelect(entity)}
              className={`flex flex-col rounded-lg border bg-card p-4 text-left shadow-sm transition hover:shadow-md ${
                isOpen
                  ? "border-foreground/40 ring-1 ring-foreground/20"
                  : "border-border hover:border-foreground/20"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-[15px] font-semibold leading-tight tracking-tight text-foreground">
                  {entity.name}
                </h3>
                <Chip label={humanizeStatus(entity.status)} tone={statusTone(entity.status)} />
              </div>
              {entity.subtitle && (
                <p className="mt-1 text-[12px] leading-snug text-muted-foreground">
                  {entity.subtitle}
                </p>
              )}
              {entity.tags.length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {entity.tags.map((t) => (
                    <Chip key={t} label={t} tone="neutral" />
                  ))}
                </div>
              )}
              <span className="mt-3 text-[12px] font-medium text-muted-foreground">
                {isOpen ? "Open now" : `Open this ${one} →`}
              </span>
            </button>
          );
        })}
      </div>

      {entities.length > 0 && filtered.length === 0 && (
        <p className="px-4 pb-6 text-[13px] text-muted-foreground">
          No {many} match “{search}”. Clear the search to see all {entities.length}.
        </p>
      )}
    </ExplainScreen>
  );
}
