import { useEffect, useState, useMemo } from "react";
import { bus } from "@/bus";
import { getDataProvider, type Entity } from "@/data";
import { getVocabulary } from "@/config";
import { useLayout } from "@/shell/layout-context";
import { usePanelScope } from "@/shell/panel-scope";
import { Search, FolderOpen, ArrowRight } from "lucide-react";
import { EdButton, EdEmpty, EdPill, EdScreen, Eyebrow, edTone, humanize } from "./editorial-kit";

/**
 * The list of matters, as cards.
 *
 * Explain-first (ruling 2026-08-10): the header block says what this screen is,
 * which matter is open, and what to do next. The searchable card grid renders
 * below it — never above.
 *
 * D-LDUX-5: editorial face, and a fix for the specific thing that made this
 * screen hard to read at narrow widths — a long matter name used to wrap to six
 * lines and push everything else out of the card. It now clamps at two lines and
 * carries the full name in its title attribute, so nothing is lost and nothing
 * blows the card up.
 */

/** The provider builds `subtitle` as `case_number · court`. Split it so the
 *  cause number can be set in mono and the court in prose. No new field. */
function splitSubtitle(subtitle: string): { cause: string | null; rest: string | null } {
  if (!subtitle) return { cause: null, rest: null };
  const parts = subtitle.split(" · ");
  const head = parts[0]?.trim() ?? "";
  if (parts.length > 1 && /\d/.test(head)) {
    return { cause: head, rest: parts.slice(1).join(" · ") };
  }
  return /\d/.test(head) && parts.length === 1
    ? { cause: head, rest: null }
    : { cause: null, rest: subtitle };
}

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
    <EdButton
      label={`Open ${selected.name}`}
      icon={ArrowRight}
      onClick={() => {
        if (!isPanelVisible("MatterHome")) openPanel("MatterHome");
        handleSelect(selected);
      }}
    />
  ) : (
    <EdButton
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
    <EdScreen
      header={{
        eyebrow: vocab.entityPlural,
        title: `Your ${many}`,
        meta: entities.length > 0 ? `${entities.length} open` : undefined,
        what: `Every ${one} you are working on. Pick one and the rest of the workspace follows it — the evidence, the chronology, the people and the money all switch to that ${one}.`,
        where:
          entities.length === 0
            ? `Loading your ${many}…`
            : selected
              ? <>You have <span className="text-ed-ink">{selected.name}</span> open.</>
              : `Nothing open yet. There ${entities.length === 1 ? "is" : "are"} ${entities.length} ${entities.length === 1 ? one : many} to choose from.`,
        next: selected
          ? `Everything below is about ${selected.name}. Pick a different card to switch.`
          : `Pick a ${one} below to open it.`,
        action,
      }}
      toolbar={
        <div className="shrink-0 border-b border-ed-rule bg-ed-card px-6 py-2.5">
          <label className="relative block max-w-sm">
            <span className="sr-only">{`Search ${many}`}</span>
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ed-muted" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${many} by name, number or party…`}
              className="ed-focus ed-serif h-9 w-full rounded-[10px] border border-ed-rule bg-ed-paper pl-8 pr-3 text-[14.5px] text-ed-ink placeholder:text-ed-muted"
            />
          </label>
        </div>
      }
    >
      <div className="grid gap-4 px-6 py-6 [grid-template-columns:repeat(auto-fill,minmax(290px,1fr))]">
        {filtered.map((entity) => {
          const isOpen = selected?.id === entity.id;
          const { cause, rest } = splitSubtitle(entity.subtitle);
          return (
            <button
              key={entity.id}
              type="button"
              onClick={() => handleSelect(entity)}
              aria-pressed={isOpen}
              className={`ed-focus flex flex-col rounded-[12px] border bg-ed-card p-5 text-left transition-[box-shadow,border-color] duration-200 hover:shadow-[0_1px_2px_rgba(35,31,26,.04),0_12px_32px_rgba(35,31,26,.06)] ${
                isOpen ? "border-ed-gold ring-1 ring-ed-gold/40" : "border-ed-rule hover:border-ed-gold/50"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <h3
                  title={entity.name}
                  className="ed-serif line-clamp-2 text-[18px] leading-[1.25] text-ed-ink"
                  style={{ fontWeight: 560 }}
                >
                  {entity.name}
                </h3>
                {entity.status && (
                  <span className="shrink-0">
                    <EdPill label={humanize(entity.status)} tone={edTone(entity.status)} />
                  </span>
                )}
              </div>

              {cause && (
                <span className="ed-mono mt-2 block truncate text-[11.5px] text-ed-muted" title={cause}>
                  {cause}
                </span>
              )}
              {rest && (
                <p className="ed-serif mt-1 line-clamp-2 text-[13.5px] leading-[1.55] text-ed-muted" title={rest}>
                  {rest}
                </p>
              )}

              {entity.tags.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {entity.tags.map((t) => (
                    <EdPill key={t} label={t} tone="neutral" title="Party or attorney" />
                  ))}
                </div>
              )}

              <span className="ed-serif mt-4 inline-flex items-center gap-1 text-[14px] text-ed-sage">
                {isOpen ? "Open now" : `Open this ${one} →`}
              </span>
            </button>
          );
        })}
      </div>

      {entities.length === 0 && (
        <EdEmpty line={`No ${many} to show yet.`} hint="Nothing has been loaded into this workspace." />
      )}

      {entities.length > 0 && filtered.length === 0 && (
        <p className="ed-serif px-6 pb-8 text-[14.5px] leading-[1.65] text-ed-muted">
          No {many} match “{search}”. Clear the search to see all {entities.length}.
        </p>
      )}

      {filtered.length > 0 && (
        <p className="px-6 pb-8">
          <Eyebrow>
            {filtered.length} of {entities.length} shown
          </Eyebrow>
        </p>
      )}
    </EdScreen>
  );
}
