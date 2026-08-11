import { useCallback, useEffect, useMemo, useState } from "react";
import { bus } from "@/bus";
import { getDataProvider, type Document, type Item } from "@/data";
import { getVocabulary } from "@/config";
import { useLayout } from "@/shell/layout-context";
import { usePanelScope } from "@/shell/panel-scope";
import { List, ArrowDownUp, Rows3, GitCommitHorizontal } from "lucide-react";
import { EdButton, EdEmpty, EdScreen, Eyebrow } from "./editorial-kit";
import { ChronologyView } from "./chronology/chronology-view";
import { TimelineView } from "./chronology/timeline-view";
import {
  EMPTY_FILTERS,
  FilterBar,
  applyFilters,
  hasAnyFilter,
  type FactFilters,
} from "./chronology/filter-bar";
import { dayLabel, toFacts, type Fact } from "./chronology/fact-model";

/**
 * CHRONOLOGY — the panel formerly rendered as a three-column sortable table.
 *
 * D-LDUX-5. Dave's brief was "make this easy to read… find some interface that
 * looks at timelines… what is a good law or case interface". The answer, taken
 * from the litigation chronology tools that do this well, is two views over one
 * set of facts and one filter bar:
 *
 *   · CHRONOLOGY (default) — the reading view. One column, fact cards, sticky
 *     month eyebrows. You read a case here.
 *   · TIMELINE — the density view. Time as the horizontal axis, so clusters read
 *     as clusters and silence reads as silence.
 *
 * The panel type is still `ItemTable` and the registry entry is untouched: this
 * is presentation. Nothing about auth, the data layer or panel registration
 * moved. See `chronology/fact-model.ts` for the one derived field (fact type)
 * and where every other field is read from.
 */

type View = "chronology" | "timeline";

const VIEW_PARAM = "chron";

/** The view is remembered in the URL as well as in state so a shared link opens
 *  on the view its sender was reading. The shell has one URL for the whole
 *  workspace rather than one per tab, so with two chronology tabs open this is
 *  the last-set view; that is a deliberate simplification, not an oversight. */
function readViewParam(): View {
  if (typeof window === "undefined") return "chronology";
  return new URLSearchParams(window.location.search).get(VIEW_PARAM) === "timeline"
    ? "timeline"
    : "chronology";
}

function writeViewParam(view: View) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (view === "chronology") url.searchParams.delete(VIEW_PARAM);
  else url.searchParams.set(VIEW_PARAM, view);
  window.history.replaceState(null, "", url.toString());
}

/**
 * Provenance arrives as free text — `kind:ref — note` from the cube store, an
 * `evidence_source` string from the case store. Neither is a foreign key, so
 * this matches rather than looks up, and falls back to opening the fact itself
 * when nothing in the evidence answers to the name. A wrong document opened
 * quietly would be worse than a fact opened honestly.
 */
export function resolveSourceDoc(docs: Document[], source: string): Document | null {
  const raw = source.trim();
  if (!raw) return null;
  const ref = raw.split(" — ")[0].split(":").slice(-1)[0].trim() || raw;
  const needle = ref.toLowerCase();
  const base = needle.split("/").slice(-1)[0];
  return (
    docs.find((d) => d.id === ref) ??
    docs.find((d) => d.title.toLowerCase() === needle) ??
    docs.find((d) => d.title.toLowerCase() === base) ??
    docs.find((d) => base.length >= 4 && d.title.toLowerCase().includes(base)) ??
    null
  );
}

export function ItemTablePanel() {
  const vocab = getVocabulary();
  const { isPanelVisible, openPanel } = useLayout();
  const { tab } = usePanelScope();

  const [items, setItems] = useState<Item[]>([]);
  const [docs, setDocs] = useState<Document[]>([]);
  const [entityName, setEntityName] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [anchorId, setAnchorId] = useState<string | null>(null);
  const [view, setView] = useState<View>(readViewParam);
  const [oldestFirst, setOldestFirst] = useState(true);
  const [filters, setFilters] = useState<FactFilters>(EMPTY_FILTERS);

  const scopeId = tab.scopeId ?? null;

  useEffect(() => {
    return bus.onScoped("entity.selected", scopeId, (event) => {
      setEntityName(event.entityName);
      setSelectedId(null);
      setAnchorId(null);
      setFilters(EMPTY_FILTERS);
      getDataProvider().listItems(event.entityId).then(setItems).catch(() => setItems([]));
      // Loaded once per matter so a source chip can resolve without a round trip
      // per click. Failure here costs the click-through, not the screen.
      getDataProvider().listDocuments().then(setDocs).catch(() => setDocs([]));
    });
  }, [scopeId]);

  const ascending = useMemo(() => toFacts(items), [items]);
  const facts = useMemo(
    () => (oldestFirst ? ascending : [...ascending].reverse()),
    [ascending, oldestFirst]
  );
  const visible = useMemo(() => applyFilters(facts, filters), [facts, filters]);

  const setViewAnd = useCallback((next: View) => {
    setView(next);
    writeViewParam(next);
  }, []);

  const select = useCallback(
    (fact: Fact) => {
      setSelectedId(fact.id);
      const emitScope = scopeId ?? tab.id;
      bus.emit("item.selected", {
        scopeId: emitScope,
        itemId: fact.id,
        itemTitle: fact.headline,
        entityId: fact.item.entityId,
      });
      bus.emit("chat.context", {
        scopeId: emitScope,
        entityId: fact.item.entityId,
        entityName,
        itemId: fact.id,
        itemTitle: fact.headline,
      });
    },
    [entityName, scopeId, tab.id]
  );

  const openSource = useCallback(
    (fact: Fact, source: string) => {
      const doc = resolveSourceDoc(docs, source);
      const emitScope = scopeId ?? tab.id;
      if (doc) {
        bus.emit("doc.open", { scopeId: emitScope, docId: doc.id, docTitle: doc.title });
        return;
      }
      select(fact);
    },
    [docs, scopeId, select, tab.id]
  );

  const one = vocab.entity.toLowerCase();

  // ---- nothing open yet -------------------------------------------------------
  if (!entityName) {
    const entityListOpen = isPanelVisible("EntityList");
    return (
      <EdScreen
        header={{
          eyebrow: vocab.itemPlural,
          title: "In the order it happened",
          what: `Every fact in one ${one}, on one page: what happened, when, who it involves and which document it came from. Read it as a chronology, or look at it on a time axis to see where the record goes quiet.`,
          where: `No ${one} is open, so there is nothing to put in order yet.`,
          next: entityListOpen
            ? `Pick a ${one} from the ${vocab.entityPlural} list.`
            : `The ${vocab.entityPlural} list is closed — open it and pick a ${one}.`,
          action: entityListOpen ? undefined : (
            <EdButton
              label={`Open ${vocab.entityPlural}`}
              icon={List}
              onClick={() => openPanel("EntityList")}
            />
          ),
        }}
      >
        <EdEmpty
          line={`Nothing to show until a ${one} is chosen.`}
          hint="The chronology follows whatever is open in the workspace."
        />
      </EdScreen>
    );
  }

  // ---- the reading surface ----------------------------------------------------
  const shown = visible.size;
  const dated = ascending.filter((f) => f.when);
  const first = dated[0];
  const last = dated[dated.length - 1];
  const nextDeadline = ascending.find((f) => f.future && f.type === "deadline");
  const filtered = hasAnyFilter(filters);

  const spanLine =
    first && last
      ? `${dayLabel(first.when!)} ${first.when!.getFullYear()} – ${dayLabel(last.when!)} ${last.when!.getFullYear()}`
      : "no dates recorded";

  return (
    <EdScreen
      header={{
        eyebrow: vocab.itemPlural,
        title: entityName,
        meta: `${ascending.length} ${ascending.length === 1 ? "fact" : "facts"} · ${spanLine}`,
        what: `Every fact in this ${one}, in the order it happened. Each card states the fact in one line and carries the document it came from — click a source to open it in the reader.`,
        where: (
          <>
            {filtered ? (
              <>
                Showing <span className="tabular-nums">{shown}</span> of{" "}
                <span className="tabular-nums">{ascending.length}</span> facts; the rest are
                filtered out, not gone.
              </>
            ) : (
              <>
                <span className="tabular-nums">{ascending.length}</span>{" "}
                {ascending.length === 1 ? "fact" : "facts"} recorded, running{" "}
                {spanLine === "no dates recorded" ? "with no dates on them" : spanLine}.
              </>
            )}
          </>
        ),
        next: nextDeadline
          ? `${nextDeadline.headline} is dated ahead of today — it is under “Coming up”.`
          : view === "chronology"
            ? "Read down the column, or switch to the timeline to see where the record goes quiet."
            : "Click any mark to jump to that fact in the chronology.",
      }}
      toolbar={
        <>
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-ed-rule bg-ed-card px-6 py-2">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setOldestFirst((v) => !v)}
                aria-label={`Sort order: ${oldestFirst ? "oldest first" : "newest first"}. Click to reverse.`}
                className="ed-focus inline-flex items-center gap-1.5 rounded-full border border-ed-rule bg-ed-paper px-2.5 py-[3px] ed-mono text-[11px] uppercase tracking-[0.05em] text-ed-muted transition-colors duration-150 hover:text-ed-ink"
              >
                <ArrowDownUp className="h-3 w-3" />
                {oldestFirst ? "Oldest first" : "Newest first"}
              </button>
              <span className="hidden items-center gap-1.5 sm:inline-flex">
                <Eyebrow>
                  {shown} of {ascending.length} shown
                </Eyebrow>
              </span>
            </div>

            <div
              role="group"
              aria-label="Chronology view"
              className="inline-flex items-center gap-1 rounded-full border border-ed-rule bg-ed-paper p-0.5"
            >
              <ViewTab
                label="Chronology"
                icon={Rows3}
                active={view === "chronology"}
                onClick={() => setViewAnd("chronology")}
              />
              <ViewTab
                label="Timeline"
                icon={GitCommitHorizontal}
                active={view === "timeline"}
                onClick={() => setViewAnd("timeline")}
              />
            </div>
          </div>
          {ascending.length > 0 && (
            <FilterBar facts={ascending} filters={filters} onChange={setFilters} />
          )}
        </>
      }
    >
      {ascending.length === 0 ? (
        <EdEmpty
          line={`Nothing is recorded in the chronology for ${entityName} yet.`}
          hint="An empty record is a normal reading, not a failure — it says only that nobody has entered a fact."
        />
      ) : view === "chronology" ? (
        <ChronologyView
          facts={facts}
          visible={visible}
          selectedId={selectedId}
          anchorId={anchorId}
          onSelect={select}
          onOpenSource={openSource}
          onFilterWho={(who) => setFilters((f) => ({ ...f, who }))}
          onFilterIssue={(issue) => setFilters((f) => ({ ...f, issue }))}
          onFilterType={(type) =>
            setFilters((f) => ({ ...f, type: f.type === type ? null : type }))
          }
        />
      ) : (
        <TimelineView
          facts={facts}
          visible={visible}
          selectedId={selectedId}
          onPick={(fact) => {
            select(fact);
            setAnchorId(fact.id);
            setViewAnd("chronology");
          }}
        />
      )}
    </EdScreen>
  );
}

function ViewTab({
  label,
  icon: Icon,
  active,
  onClick,
}: {
  label: string;
  icon: typeof Rows3;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`ed-focus inline-flex items-center gap-1.5 rounded-full px-3 py-1 ed-mono text-[11px] uppercase tracking-[0.05em] transition-colors duration-150 ${
        active ? "bg-ed-card text-ed-ink shadow-[0_1px_2px_rgba(35,31,26,.08)]" : "text-ed-muted hover:text-ed-ink"
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}
