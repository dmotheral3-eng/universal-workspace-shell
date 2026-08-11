import { useCallback, useEffect, useRef, useState } from "react";
import { EdPill, Eyebrow, SourceChip, humanize } from "../editorial-kit";
import {
  FACT_TYPES,
  dayLabel,
  gapLabel,
  groupByMonth,
  type Fact,
} from "./fact-model";

/**
 * CHRONOLOGY VIEW — the reading view, and the default.
 *
 * One column, ~72ch, sticky month eyebrows, and a fact card as the atom. This is
 * the Casefleet/Everchron anatomy set in the house face: date on a left rail
 * threaded by a sage rule, a one-line headline stating the fact the way a lawyer
 * would state it, one or two lines of summary, then the chips that say where it
 * came from and who it involves. Every chip is a way into the record behind it.
 *
 * Keyboard: ↑/↓ move between facts, Home/End jump to the ends, Enter opens the
 * focused fact in the reader. Focus rings are gold and never suppressed.
 */

const CARD_SELECTOR = "button[data-fact-primary]";

export function ChronologyView({
  facts,
  visible,
  selectedId,
  anchorId,
  onSelect,
  onOpenSource,
  onFilterWho,
  onFilterIssue,
  onFilterType,
}: {
  /** Every fact, in reading order — dividers are built from this, not from the
   *  filtered set, so filtering never rewrites the shape of the case. */
  facts: Fact[];
  visible: Set<string>;
  selectedId: string | null;
  /** A fact to scroll to — set when the timeline view hands a fact over. */
  anchorId: string | null;
  onSelect: (fact: Fact) => void;
  onOpenSource: (fact: Fact, source: string) => void;
  onFilterWho: (who: string) => void;
  onFilterIssue: (issue: string) => void;
  onFilterType: (type: Fact["type"]) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const groups = groupByMonth(facts, visible);
  const firstFutureId = facts.find((f) => f.future && visible.has(f.id))?.id ?? null;
  const shownCount = facts.filter((f) => visible.has(f.id)).length;

  useEffect(() => {
    if (!anchorId || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(`[data-fact-id="${CSS.escape(anchorId)}"]`);
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    el.querySelector<HTMLElement>(CARD_SELECTOR)?.focus({ preventScroll: true });
  }, [anchorId]);

  const onKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
    const root = listRef.current;
    if (!root) return;
    const cards = [...root.querySelectorAll<HTMLElement>(CARD_SELECTOR)];
    if (cards.length === 0) return;
    const here = cards.findIndex((c) => c === document.activeElement || c.contains(document.activeElement));
    let next = here;
    if (e.key === "ArrowDown") next = here < 0 ? 0 : Math.min(here + 1, cards.length - 1);
    if (e.key === "ArrowUp") next = here < 0 ? cards.length - 1 : Math.max(here - 1, 0);
    if (e.key === "Home") next = 0;
    if (e.key === "End") next = cards.length - 1;
    if (next === here) return;
    e.preventDefault();
    cards[next].focus();
    cards[next].scrollIntoView({ block: "nearest" });
  }, []);

  if (facts.length === 0) return null;

  /** Days of silence before this fact — the gap, made visible in the reading
   *  view too, not only on the axis. */
  const gapBefore = (index: number): number | null => {
    if (index === 0) return null;
    const prev = facts[index - 1];
    const here = facts[index];
    if (!prev.when || !here.when) return null;
    const days = Math.round(Math.abs(here.when.getTime() - prev.when.getTime()) / 86_400_000);
    return days >= 60 ? days : null;
  };

  const indexOf = new Map(facts.map((f, i) => [f.id, i]));

  return (
    <div
      ref={listRef}
      role="region"
      aria-label="Chronology"
      onKeyDown={onKeyDown}
      className="w-full max-w-[calc(72ch+140px)] pb-16"
    >
      {shownCount === 0 && (
        <p className="ed-serif px-6 py-10 text-center text-[15px] leading-[1.65] text-ed-muted">
          Nothing matches those filters. The {facts.length}-fact record is still
          there — clear a filter to see it.
        </p>
      )}

      {groups.map((group) => {
        const opensFuture = group.facts.length > 0 && group.facts[0].id === firstFutureId;
        return (
          <section key={group.key} aria-label={group.label}>
            {opensFuture && <ComingUp />}

            <div className="sticky top-0 z-10 flex items-baseline justify-between gap-3 border-b border-ed-rule bg-ed-paper/95 px-6 py-2 backdrop-blur-[2px]">
              <Eyebrow>{group.label}</Eyebrow>
              <span className="ed-mono text-[11px] text-ed-muted tabular-nums">
                {group.facts.length > 0
                  ? `${group.facts.length} ${group.facts.length === 1 ? "fact" : "facts"}`
                  : "—"}
                {group.hidden > 0 && ` · ${group.hidden} hidden`}
              </span>
            </div>

            {group.facts.length === 0 ? (
              <p className="ed-serif px-6 py-3 text-[13.5px] italic text-ed-muted">
                {group.hidden} {group.hidden === 1 ? "fact" : "facts"} in this month are
                filtered out.
              </p>
            ) : (
              <div className="relative space-y-2.5 px-6 py-3">
                {/* the thread — a hairline of sage running behind the date rail */}
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-y-2 left-[100px] w-px bg-ed-sage/30"
                />
                {group.facts.map((fact) => {
                  const i = indexOf.get(fact.id) ?? 0;
                  const gap = gapBefore(i);
                  return (
                    <div key={fact.id}>
                      {gap !== null && <GapLine days={gap} />}
                      {fact.id === firstFutureId && !opensFuture && <ComingUp inline />}
                      <FactCard
                        fact={fact}
                        selected={selectedId === fact.id}
                        onSelect={onSelect}
                        onOpenSource={onOpenSource}
                        onFilterWho={onFilterWho}
                        onFilterIssue={onFilterIssue}
                        onFilterType={onFilterType}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function ComingUp({ inline }: { inline?: boolean }) {
  return (
    <div
      className={`flex items-center gap-3 ${inline ? "px-0 py-3" : "px-6 py-3"}`}
      role="separator"
      aria-label="Coming up — facts dated after today"
    >
      <span className="ed-eyebrow text-ed-attn">Coming up</span>
      <span className="h-px flex-1 bg-ed-attn/30" />
    </div>
  );
}

/** Where the record is silent, said out loud. The density view shows the same
 *  silence as white space; here it gets a sentence. */
function GapLine({ days }: { days: number }) {
  return (
    <div className="flex items-center gap-3 py-2 pl-[94px] pr-2">
      <span className="ed-mono text-[11px] uppercase tracking-[0.05em] text-ed-muted/80">
        {gapLabel(days)}
      </span>
      <span className="h-px flex-1 border-t border-dashed border-ed-rule" />
    </div>
  );
}

function FactCard({
  fact,
  selected,
  onSelect,
  onOpenSource,
  onFilterWho,
  onFilterIssue,
  onFilterType,
}: {
  fact: Fact;
  selected: boolean;
  onSelect: (fact: Fact) => void;
  onOpenSource: (fact: Fact, source: string) => void;
  onFilterWho: (who: string) => void;
  onFilterIssue: (issue: string) => void;
  onFilterType: (type: Fact["type"]) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const spec = FACT_TYPES[fact.type];
  const clock = fact.type === "deadline";
  const long = fact.summary.length > 150 || fact.summary.includes("\n");

  return (
    <article
      data-fact-id={fact.id}
      className="grid grid-cols-[78px_minmax(0,1fr)] gap-x-4"
    >
      {/* left rail — mono date, and the dot that sits on the thread. The year is
          carried by the month divider above, so it is not repeated here. */}
      <div className="relative pt-[11px]">
        <span
          className="ed-mono block pr-3 text-right text-[11.5px] leading-none text-ed-muted tabular-nums"
          title={fact.when ? fact.when.toISOString().slice(0, 10) : "no date recorded"}
        >
          {fact.when ? dayLabel(fact.when) : "—"}
        </span>
        <span
          aria-hidden
          className={`absolute left-[72px] top-[8px] h-[9px] w-[9px] rounded-full ring-2 ring-ed-paper ${spec.dot}`}
        />
      </div>

      {/* the card */}
      <div
        className={`rounded-[12px] border bg-ed-card px-4 py-3 transition-colors duration-200 ${
          clock ? "border-l-[3px] border-l-ed-attn bg-ed-attn-soft/35" : ""
        } ${selected ? "border-ed-gold ring-1 ring-ed-gold/40" : "border-ed-rule"}`}
      >
        <button
          type="button"
          data-fact-primary
          onClick={() => onSelect(fact)}
          aria-label={`${fact.headline}. ${fact.when ? dayLabel(fact.when) + " " + fact.when.getFullYear() : "undated"}. ${spec.label}. Open in the reader.`}
          className="ed-focus block w-full text-left"
        >
          <h3
            className="ed-serif truncate text-[17.5px] leading-[1.35] text-ed-ink"
            style={{ fontWeight: 560 }}
            title={fact.headline}
          >
            {fact.headline}
          </h3>
        </button>

        {fact.summary &&
          (long ? (
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              aria-expanded={expanded}
              className="ed-focus mt-1 block w-full text-left"
            >
              <p
                className={`ed-serif text-[14.5px] leading-[1.65] text-ed-muted ${
                  expanded ? "" : "line-clamp-2"
                }`}
              >
                {fact.summary}
              </p>
              <span className="ed-mono mt-1 inline-block text-[10.5px] uppercase tracking-[0.05em] text-ed-sage">
                {expanded ? "Less" : "More"}
              </span>
            </button>
          ) : (
            <p className="ed-serif mt-1 text-[14.5px] leading-[1.65] text-ed-muted">
              {fact.summary}
            </p>
          ))}

        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {/* type marker — dot AND label, so colour is never the only carrier */}
          <button
            type="button"
            onClick={() => onFilterType(fact.type)}
            title={spec.gloss}
            className="ed-focus inline-flex items-center gap-1.5 rounded-full px-1 py-[2px] ed-mono text-[10.5px] uppercase tracking-[0.08em] text-ed-muted transition-colors duration-150 hover:text-ed-ink"
          >
            <span aria-hidden className={`h-[7px] w-[7px] rounded-full ${spec.dot}`} />
            {spec.label}
          </button>

          {fact.sources.map((s) => (
            <SourceChip
              key={s}
              label={s}
              onOpen={() => onOpenSource(fact, s)}
              title={`Source: ${s} — open it in the reader`}
            />
          ))}

          {fact.who.map((w) => (
            <EdPill
              key={w}
              label={w}
              tone="ok"
              title="Who or what the record attributes this fact to"
              onClick={() => onFilterWho(w)}
            />
          ))}

          {fact.issues.map((i) => (
            <EdPill
              key={i}
              label={humanize(i)}
              tone="gold"
              title="Issue or phase this fact sits under"
              onClick={() => onFilterIssue(i)}
            />
          ))}
        </div>
      </div>
    </article>
  );
}
