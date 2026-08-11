import { useMemo } from "react";
import { Search } from "lucide-react";
import { EdPill, Eyebrow, humanize } from "../editorial-kit";
import { FACT_TYPES, FACT_TYPE_ORDER, type Fact, type FactType } from "./fact-model";

/**
 * The filter bar is shared by both chronology views, by design: switching from
 * the reading view to the density view must not silently change what you are
 * looking at. State lives in the panel and is handed down here.
 *
 * Filtering never destroys structure. The month dividers are built from the
 * unfiltered set (see `groupByMonth`), so a filtered month collapses to a line
 * saying what it is holding back rather than vanishing and taking the shape of
 * the case with it.
 */

export interface FactFilters {
  text: string;
  who: string | null;
  issue: string | null;
  type: FactType | null;
  /** ISO day, inclusive. "" means unbounded. */
  from: string;
  to: string;
}

export const EMPTY_FILTERS: FactFilters = {
  text: "",
  who: null,
  issue: null,
  type: null,
  from: "",
  to: "",
};

export function hasAnyFilter(f: FactFilters): boolean {
  return Boolean(f.text.trim() || f.who || f.issue || f.type || f.from || f.to);
}

export interface Facets {
  who: string[];
  issues: string[];
  types: FactType[];
}

export function facetsOf(facts: Fact[]): Facets {
  const who = new Set<string>();
  const issues = new Set<string>();
  const types = new Set<FactType>();
  for (const f of facts) {
    f.who.forEach((w) => w && who.add(w));
    f.issues.forEach((i) => i && issues.add(i));
    types.add(f.type);
  }
  return {
    who: [...who].sort((a, b) => a.localeCompare(b)),
    issues: [...issues].sort((a, b) => a.localeCompare(b)),
    types: FACT_TYPE_ORDER.filter((t) => types.has(t)),
  };
}

/** Everything a fact can be searched by, lower-cased once. */
function haystack(f: Fact): string {
  return [f.headline, f.summary, f.iso, ...f.who, ...f.issues, ...f.sources]
    .join(" ")
    .toLowerCase();
}

export function applyFilters(facts: Fact[], filters: FactFilters): Set<string> {
  const text = filters.text.trim().toLowerCase();
  const visible = new Set<string>();
  for (const f of facts) {
    if (filters.type && f.type !== filters.type) continue;
    if (filters.who && !f.who.includes(filters.who)) continue;
    if (filters.issue && !f.issues.includes(filters.issue)) continue;
    // An undated fact cannot satisfy a date bound, and saying so by hiding it is
    // more honest than quietly letting it through a range it was never in.
    if (filters.from && (!f.iso || f.iso < filters.from)) continue;
    if (filters.to && (!f.iso || f.iso > filters.to)) continue;
    if (text && !haystack(f).includes(text)) continue;
    visible.add(f.id);
  }
  return visible;
}

const FIELD =
  "ed-focus ed-mono h-8 rounded-[8px] border border-ed-rule bg-ed-card px-2 text-[12px] text-ed-ink";

export function FilterBar({
  facts,
  filters,
  onChange,
}: {
  facts: Fact[];
  filters: FactFilters;
  onChange: (next: FactFilters) => void;
}) {
  const facets = useMemo(() => facetsOf(facts), [facts]);
  const set = (patch: Partial<FactFilters>) => onChange({ ...filters, ...patch });

  const active: { key: string; label: string; clear: () => void }[] = [];
  if (filters.text.trim())
    active.push({ key: "text", label: `“${filters.text.trim()}”`, clear: () => set({ text: "" }) });
  if (filters.who) active.push({ key: "who", label: filters.who, clear: () => set({ who: null }) });
  if (filters.issue)
    active.push({ key: "issue", label: humanize(filters.issue), clear: () => set({ issue: null }) });
  if (filters.type)
    active.push({ key: "type", label: FACT_TYPES[filters.type].label, clear: () => set({ type: null }) });
  if (filters.from)
    active.push({ key: "from", label: `from ${filters.from}`, clear: () => set({ from: "" }) });
  if (filters.to) active.push({ key: "to", label: `to ${filters.to}`, clear: () => set({ to: "" }) });

  return (
    <div className="shrink-0 border-b border-ed-rule bg-ed-card/70 px-6 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative">
          <span className="sr-only">Search the chronology</span>
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ed-muted" />
          <input
            type="search"
            value={filters.text}
            onChange={(e) => set({ text: e.target.value })}
            placeholder="Search facts…"
            className={`${FIELD} w-[190px] pl-7`}
          />
        </label>

        <label className="inline-flex items-center gap-1.5">
          <Eyebrow>Who</Eyebrow>
          <select
            aria-label="Filter by who the record attributes the fact to"
            value={filters.who ?? ""}
            onChange={(e) => set({ who: e.target.value || null })}
            className={FIELD}
          >
            <option value="">Anyone</option>
            {facets.who.map((w) => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
          </select>
        </label>

        <label className="inline-flex items-center gap-1.5">
          <Eyebrow>Issue</Eyebrow>
          <select
            aria-label="Filter by issue or phase"
            value={filters.issue ?? ""}
            onChange={(e) => set({ issue: e.target.value || null })}
            className={FIELD}
          >
            <option value="">Any issue</option>
            {facets.issues.map((i) => (
              <option key={i} value={i}>
                {humanize(i)}
              </option>
            ))}
          </select>
        </label>

        <label className="inline-flex items-center gap-1.5">
          <Eyebrow>Kind</Eyebrow>
          <select
            aria-label="Filter by kind of fact"
            value={filters.type ?? ""}
            onChange={(e) => set({ type: (e.target.value || null) as FactType | null })}
            className={FIELD}
          >
            <option value="">Any kind</option>
            {facets.types.map((t) => (
              <option key={t} value={t}>
                {FACT_TYPES[t].label}
              </option>
            ))}
          </select>
        </label>

        <label className="inline-flex items-center gap-1.5">
          <Eyebrow>Between</Eyebrow>
          <input
            type="date"
            aria-label="Earliest date"
            value={filters.from}
            onChange={(e) => set({ from: e.target.value })}
            className={FIELD}
          />
          <span className="text-ed-muted">–</span>
          <input
            type="date"
            aria-label="Latest date"
            value={filters.to}
            onChange={(e) => set({ to: e.target.value })}
            className={FIELD}
          />
        </label>
      </div>

      {active.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Eyebrow>Showing only</Eyebrow>
          {active.map((a) => (
            <EdPill key={a.key} label={a.label} tone="gold" onDismiss={a.clear} />
          ))}
          <button
            type="button"
            onClick={() => onChange(EMPTY_FILTERS)}
            className="ed-focus ed-mono rounded-full px-2 py-[3px] text-[11px] uppercase tracking-[0.05em] text-ed-muted transition-colors duration-150 hover:text-ed-ink"
          >
            Clear all
          </button>
        </div>
      )}
    </div>
  );
}
