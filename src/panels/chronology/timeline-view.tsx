import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { Eyebrow } from "../editorial-kit";
import {
  FACT_TYPES,
  FACT_TYPE_ORDER,
  dayLabel,
  gapLabel,
  monthLabel,
  type Fact,
} from "./fact-model";

/**
 * TIMELINE VIEW — the density view.
 *
 * The reading view answers "what happened". This one answers "what does this
 * case LOOK like": where the record clusters, and — the reason it earns its
 * place — where the record is SILENT. Time is the horizontal axis and position
 * is proportional to it, so an empty stretch is empty on screen. Nothing is
 * spaced evenly to look tidy; that would hide the exact thing worth seeing.
 *
 * One lane per kind of fact, each lane labelled in mono with its own dot, so the
 * colour is a second carrier of the type rather than the only one. Facts the
 * filters removed stay on the axis as faint marks: filtering changes what you
 * are reading, not what the record contains.
 */

const LANE_H = 34;
const MIN_ZOOM = 1;
const MAX_ZOOM = 12;
/** Below this, a stretch of quiet is just the ordinary rhythm of a file. */
const GAP_DAYS = 60;

interface Placed {
  fact: Fact;
  /** 0–1 across the case span. */
  at: number;
  lane: number;
  shown: boolean;
}

export function TimelineView({
  facts,
  visible,
  selectedId,
  onPick,
}: {
  facts: Fact[];
  visible: Set<string>;
  selectedId: string | null;
  /** Click hands the fact back to the chronology view, anchored on it. */
  onPick: (fact: Fact) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [viewport, setWindow] = useState({ left: 0, width: 1 });
  const [hover, setHover] = useState<{ fact: Fact; x: number; y: number } | null>(null);

  const dated = useMemo(() => facts.filter((f) => f.when), [facts]);

  const span = useMemo(() => {
    if (dated.length === 0) return null;
    const times = dated.map((f) => f.when!.getTime());
    const min = Math.min(...times);
    const max = Math.max(...times);
    // A single-day case still needs a non-zero denominator; pad it by a month so
    // the one fact lands in the middle rather than dividing by zero.
    return max === min ? { min: min - 15 * 86_400_000, max: max + 15 * 86_400_000 } : { min, max };
  }, [dated]);

  const lanes = useMemo(() => {
    const present = new Set(dated.map((f) => f.type));
    return FACT_TYPE_ORDER.filter((t) => present.has(t));
  }, [dated]);

  const placed = useMemo<Placed[]>(() => {
    if (!span) return [];
    const width = span.max - span.min;
    return dated.map((f) => ({
      fact: f,
      at: (f.when!.getTime() - span.min) / width,
      lane: Math.max(0, lanes.indexOf(f.type)),
      shown: visible.has(f.id),
    }));
  }, [dated, lanes, span, visible]);

  /** Stretches of silence, measured on the whole record. */
  const gaps = useMemo(() => {
    if (!span) return [];
    const width = span.max - span.min;
    const out: { from: number; to: number; days: number }[] = [];
    const sorted = [...dated].sort((a, b) => a.sortKey - b.sortKey);
    for (let i = 1; i < sorted.length; i += 1) {
      const a = sorted[i - 1].when!.getTime();
      const b = sorted[i].when!.getTime();
      const days = Math.round((b - a) / 86_400_000);
      if (days >= GAP_DAYS) {
        out.push({ from: (a - span.min) / width, to: (b - span.min) / width, days });
      }
    }
    return out;
  }, [dated, span]);

  /** Month ticks, thinned so labels never collide at low zoom. */
  const ticks = useMemo(() => {
    if (!span) return [];
    const width = span.max - span.min;
    const months = width / (30.44 * 86_400_000);
    const perLabel = Math.max(1, Math.ceil(months / (6 * zoom)));
    const out: { at: number; label: string; major: boolean }[] = [];
    const cursor = new Date(span.min);
    cursor.setDate(1);
    cursor.setHours(0, 0, 0, 0);
    let n = 0;
    while (cursor.getTime() <= span.max && out.length < 400) {
      const at = (cursor.getTime() - span.min) / width;
      if (at >= 0 && n % perLabel === 0) {
        out.push({ at, label: monthLabel(cursor), major: cursor.getMonth() === 0 });
      }
      cursor.setMonth(cursor.getMonth() + 1);
      n += 1;
    }
    return out;
  }, [span, zoom]);

  const syncWindow = useCallback(() => {
    const el = scrollRef.current;
    if (!el || el.scrollWidth === 0) return;
    setWindow({ left: el.scrollLeft / el.scrollWidth, width: el.clientWidth / el.scrollWidth });
  }, []);

  useEffect(() => {
    syncWindow();
  }, [syncWindow, zoom]);

  if (!span) {
    return (
      <p className="ed-serif px-6 py-10 text-center text-[15px] leading-[1.65] text-ed-muted">
        The axis needs dates. Nothing in this record carries one yet, so there is
        nothing to place in time — the chronology view still lists what is here.
      </p>
    );
  }

  const height = lanes.length * LANE_H + 26;

  const scrollToFraction = (f: number) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollLeft = Math.max(0, f * el.scrollWidth - el.clientWidth / 2);
  };

  return (
    <div className="px-6 py-4">
      {/* zoom + legend */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          {lanes.map((t) => (
            <span key={t} className="inline-flex items-center gap-1.5" title={FACT_TYPES[t].gloss}>
              <span aria-hidden className={`h-[7px] w-[7px] rounded-full ${FACT_TYPES[t].dot}`} />
              <Eyebrow>{FACT_TYPES[t].label}</Eyebrow>
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Eyebrow>Scale</Eyebrow>
          <button
            type="button"
            aria-label="Zoom out"
            onClick={() => setZoom((z) => Math.max(MIN_ZOOM, Math.round((z - 1) * 10) / 10))}
            className="ed-focus flex h-6 w-6 items-center justify-center rounded-full border border-ed-rule bg-ed-card text-ed-muted transition-colors duration-150 hover:text-ed-ink"
          >
            <Minus className="h-3 w-3" />
          </button>
          <input
            type="range"
            aria-label="Timeline scale"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={0.5}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="ed-focus h-1 w-28 accent-[var(--ed-sage)]"
          />
          <button
            type="button"
            aria-label="Zoom in"
            onClick={() => setZoom((z) => Math.min(MAX_ZOOM, Math.round((z + 1) * 10) / 10))}
            className="ed-focus flex h-6 w-6 items-center justify-center rounded-full border border-ed-rule bg-ed-card text-ed-muted transition-colors duration-150 hover:text-ed-ink"
          >
            <Plus className="h-3 w-3" />
          </button>
          <span className="ed-mono w-10 text-right text-[11px] text-ed-muted tabular-nums">
            {zoom.toFixed(1)}×
          </span>
        </div>
      </div>

      {/* the axis */}
      <div className="relative mt-3 rounded-[12px] border border-ed-rule bg-ed-card">
        <div
          ref={scrollRef}
          onScroll={syncWindow}
          className="overflow-x-auto overflow-y-hidden"
          role="group"
          aria-label="Case timeline axis. Use the chronology view for a keyboard-readable list."
        >
          <div className="relative" style={{ width: `${zoom * 100}%`, height }}>
            {/* lane rules run edge to edge; everything positioned in time lives in
                the inset track below, so a fact on the first or last day is drawn
                whole rather than sliced in half by the card border. */}
            {lanes.map((t, i) => (
              <div
                key={t}
                aria-hidden
                className="absolute left-0 right-0 border-t border-dashed border-ed-rule/70"
                style={{ top: i * LANE_H + LANE_H / 2 }}
              />
            ))}

            <div className="absolute inset-y-0 left-3 right-3">
            {/* silence, as silence */}
            {gaps.map((g) => (
              <div
                key={`${g.from}-${g.to}`}
                className="absolute top-0 bottom-6 bg-[repeating-linear-gradient(135deg,transparent_0_6px,var(--ed-rule)_6px_7px)] opacity-60"
                style={{ left: `${g.from * 100}%`, width: `${(g.to - g.from) * 100}%` }}
                title={`${gapLabel(g.days)} — nothing between these two facts`}
              >
                <span className="ed-mono absolute bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-ed-card px-1.5 text-[10px] uppercase tracking-[0.05em] text-ed-muted">
                  {gapLabel(g.days)}
                </span>
              </div>
            ))}

            {/* month ticks */}
            {ticks.map((t) => (
              <div
                key={t.label}
                className={`absolute top-0 bottom-6 w-px ${t.major ? "bg-ed-rule" : "bg-ed-rule/55"}`}
                style={{ left: `${t.at * 100}%` }}
              >
                <span className="ed-mono absolute -bottom-5 left-1 whitespace-nowrap text-[10px] uppercase tracking-[0.08em] text-ed-muted">
                  {t.label}
                </span>
              </div>
            ))}

            {/* the facts */}
            {placed.map((p) => (
              <button
                key={p.fact.id}
                type="button"
                onClick={() => onPick(p.fact)}
                onMouseEnter={(e) =>
                  setHover({
                    fact: p.fact,
                    x: e.currentTarget.offsetLeft,
                    y: p.lane * LANE_H + LANE_H / 2,
                  })
                }
                onMouseLeave={() => setHover(null)}
                onFocus={(e) =>
                  setHover({
                    fact: p.fact,
                    x: e.currentTarget.offsetLeft,
                    y: p.lane * LANE_H + LANE_H / 2,
                  })
                }
                onBlur={() => setHover(null)}
                tabIndex={p.shown ? 0 : -1}
                aria-hidden={!p.shown}
                aria-label={`${p.fact.headline}, ${p.fact.when ? dayLabel(p.fact.when) : ""} ${p.fact.when?.getFullYear() ?? ""}, ${FACT_TYPES[p.fact.type].label}. Open in the chronology.`}
                title={`${p.fact.when ? dayLabel(p.fact.when) + " " + p.fact.when.getFullYear() + " · " : ""}${p.fact.headline}`}
                className={`ed-focus absolute -translate-x-1/2 -translate-y-1/2 rounded-full transition-[height,width,opacity] duration-150 ${
                  FACT_TYPES[p.fact.type].dot
                } ${p.shown ? "opacity-100" : "pointer-events-none opacity-20"} ${
                  selectedId === p.fact.id ? "h-[15px] w-[15px] ring-2 ring-ed-gold" : "h-[11px] w-[11px] hover:h-[15px] hover:w-[15px]"
                }`}
                style={{ left: `${p.at * 100}%`, top: p.lane * LANE_H + LANE_H / 2 }}
              />
            ))}

            {/* hover / focus tooltip */}
            {hover && (
              <div
                className="pointer-events-none absolute z-20 max-w-[36ch] -translate-x-1/2 rounded-[10px] border border-ed-rule bg-ed-card px-3 py-2 shadow-[0_12px_32px_rgba(35,31,26,.12)]"
                style={{ left: hover.x, top: hover.y + 14 }}
              >
                <span className="ed-mono block text-[10.5px] uppercase tracking-[0.08em] text-ed-muted">
                  {hover.fact.when
                    ? `${dayLabel(hover.fact.when)} ${hover.fact.when.getFullYear()}`
                    : "Undated"}{" "}
                  · {FACT_TYPES[hover.fact.type].label}
                </span>
                <span className="ed-serif mt-1 block text-[14.5px] leading-[1.4] text-ed-ink">
                  {hover.fact.headline}
                </span>
              </div>
            )}
            </div>
          </div>
        </div>
      </div>

      {/* minimap — the whole span, and the slice you are looking at */}
      <div className="mt-2">
        <button
          type="button"
          aria-label="Jump to a point in the case span"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            scrollToFraction((e.clientX - rect.left) / rect.width);
          }}
          className="ed-focus relative block h-7 w-full overflow-hidden rounded-[7px] border border-ed-rule bg-ed-paper"
        >
          <span aria-hidden className="absolute inset-y-0 left-1 right-1 block">
          {placed.map((p) => (
            <span
              key={p.fact.id}
              aria-hidden
              className={`absolute top-1.5 h-4 w-px ${FACT_TYPES[p.fact.type].dot} ${
                p.shown ? "opacity-70" : "opacity-20"
              }`}
              style={{ left: `${p.at * 100}%` }}
            />
          ))}
          </span>
          <span
            aria-hidden
            className="absolute inset-y-0 border-x border-ed-gold bg-ed-gold/12"
            style={{ left: `${viewport.left * 100}%`, width: `${Math.min(1, viewport.width) * 100}%` }}
          />
        </button>
        <div className="mt-1 flex items-center justify-between">
          <span className="ed-mono text-[10.5px] text-ed-muted tabular-nums">
            {new Date(span.min).toISOString().slice(0, 10)}
          </span>
          <Eyebrow>Full case span · click to jump</Eyebrow>
          <span className="ed-mono text-[10.5px] text-ed-muted tabular-nums">
            {new Date(span.max).toISOString().slice(0, 10)}
          </span>
        </div>
      </div>

      <p className="ed-serif mt-4 max-w-[72ch] text-[14px] leading-[1.65] text-ed-muted">
        Position is time, so the empty stretches are real: each hatched band is a
        run of at least {GAP_DAYS} days in which nothing was recorded. Click any
        fact to read it in the chronology.
      </p>
    </div>
  );
}
