import type { ComponentType, ReactNode } from "react";
import { useEffect, useState } from "react";

/**
 * EDITORIAL KIT — the Centripetal house reading look, as shell components.
 *
 * ADOPTED BY D-LDUX-5. Dave's brief: "make this easy to read… what is a good law
 * or case interface… make this nicer or more easy to read." The answer is two
 * references blended:
 *
 *   A. litigation chronology tools (Casefleet, Everchron) — the FACT CARD is the
 *      atom: date, one-line headline, short summary, source / people / issue
 *      chips, and a click-through to the evidence behind it.
 *   B. the house editorial look live at cre.centripetal-ai.com — Fraunces for
 *      reading text, IBM Plex Mono for eyebrows and dates, paper ground,
 *      hairline-ruled cards, pill tags, line-height 1.65, generous whitespace.
 *
 * This file is the B half, made reusable. It EXTENDS the theme — the tokens live
 * in `src/index.css` as `--ed-*` and reach these components through the
 * `bg-ed-*` / `text-ed-*` / `border-ed-*` utilities. There is no second style
 * system here and there must not become one: no literal hex below.
 *
 * Relationship to the two kits already in the tree:
 *   · `panels/explain` — the explain-first ruling (2026-08-10). Still binding.
 *     `EdScreen` below IS that block, re-set in the editorial face; the reading
 *     order (what this is → where you are → do next → the dense thing) is
 *     unchanged, because the ruling is about order, not about type.
 *   · `panels/legal/ld-kit` — the six legal data panels' fixed Linear palette.
 *     Untouched. Those panels are tables of figures, not reading surfaces.
 */

// ---- tone ---------------------------------------------------------------------

/** Four tones, and only four. `ok` is sage, `gold` is a live issue or a phase,
 *  `attn` is something with a clock on it, `neutral` is everything else. */
export type EdTone = "neutral" | "ok" | "gold" | "attn";

const PILL_TONE: Record<EdTone, string> = {
  neutral: "bg-ed-paper text-ed-muted border-ed-rule",
  ok: "bg-ed-sage-soft text-ed-sage border-ed-sage/25",
  gold: "bg-ed-gold-soft text-ed-gold border-ed-gold/30",
  attn: "bg-ed-attn-soft text-ed-attn border-ed-attn/25",
};

/** Open vocabularies: a store can add a status at any time and an unseen value
 *  must read as calm, never as an error. Anything unknown lands on neutral. */
const STATUS_TONES: Record<string, EdTone> = {
  active: "ok",
  open: "gold",
  filed: "ok",
  served: "ok",
  complete: "ok",
  completed: "ok",
  closed: "ok",
  resolved: "ok",
  settled: "ok",
  reviewed: "ok",
  responded: "ok",
  produced: "ok",
  done: "ok",
  discovery: "gold",
  pending: "gold",
  pending_review: "gold",
  in_progress: "gold",
  draft: "gold",
  drafted: "gold",
  prepared: "gold",
  sent: "gold",
  scheduled: "gold",
  planned: "gold",
  todo: "gold",
  awaiting_response: "gold",
  collected: "gold",
  overdue: "attn",
  flagged: "attn",
  objected: "attn",
  quashed: "attn",
  withdrawn: "attn",
  refused: "attn",
  failed: "attn",
  missing: "attn",
  disputed: "attn",
  blocked: "attn",
  expired: "attn",
};

export function edTone(value: string | null | undefined): EdTone {
  const key = String(value ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  return STATUS_TONES[key] ?? "neutral";
}

/** Underscores out, first letter up, the rest left alone — an enum value we have
 *  never seen still renders as words rather than as raw column soup. */
export function humanize(value: string | null | undefined): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const spaced = raw.replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

// ---- motion -------------------------------------------------------------------

/** Reduced motion is a preference, not a hint. Components that fade ask this
 *  first; the CSS `.ed-motion` guard in index.css catches the rest. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

// ---- primitives ---------------------------------------------------------------

export function Eyebrow({
  children,
  tick,
  className = "",
}: {
  children: ReactNode;
  /** The sage tick that opens a house eyebrow. */
  tick?: boolean;
  className?: string;
}) {
  return (
    <span className={`ed-eyebrow ${className}`}>
      {tick && <span className="mr-1.5 text-ed-sage">§</span>}
      {children}
    </span>
  );
}

export function EdPill({
  label,
  tone = "neutral",
  title,
  onClick,
  onDismiss,
  active,
  icon: Icon,
}: {
  label: string;
  tone?: EdTone;
  title?: string;
  onClick?: () => void;
  /** Renders the × affordance; used by the active-filter chips. */
  onDismiss?: () => void;
  active?: boolean;
  icon?: ComponentType<{ className?: string }>;
}) {
  const base = `inline-flex max-w-full items-center gap-1 rounded-full border px-2.5 py-[3px] ed-mono text-[11px] uppercase tracking-[0.05em] ${PILL_TONE[tone]}`;
  const body = (
    <>
      {Icon && <Icon className="h-3 w-3 shrink-0" />}
      <span className="truncate">{label}</span>
    </>
  );

  if (onDismiss) {
    return (
      <span className={base} title={title}>
        {body}
        <button
          type="button"
          onClick={onDismiss}
          aria-label={`Remove filter ${label}`}
          className="ed-focus -mr-1 ml-0.5 rounded-full px-1 leading-none opacity-60 transition-opacity duration-150 hover:opacity-100"
        >
          ×
        </button>
      </span>
    );
  }

  if (!onClick) {
    return (
      <span className={base} title={title}>
        {body}
      </span>
    );
  }

  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      aria-pressed={active}
      className={`${base} ed-focus cursor-pointer transition-colors duration-150 hover:border-ed-gold/50 ${
        active ? "ring-1 ring-ed-gold/50" : ""
      }`}
    >
      {body}
    </button>
  );
}

/** A source-document chip: mono, paper ground, hairline border. Clicking one
 *  opens that document in the reading pane — that is the whole point of it. */
export function SourceChip({
  label,
  onOpen,
  title,
}: {
  label: string;
  onOpen?: () => void;
  title?: string;
}) {
  const base =
    "inline-flex max-w-[26ch] items-center gap-1 rounded-[5px] border border-ed-rule bg-ed-paper px-1.5 py-[2px] ed-mono text-[11px] text-ed-muted";
  if (!onOpen) {
    return (
      <span className={base} title={title ?? label}>
        <span className="truncate">{label}</span>
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onOpen}
      title={title ?? `Open ${label}`}
      className={`${base} ed-focus transition-colors duration-150 hover:border-ed-gold/60 hover:text-ed-ink`}
    >
      <span className="truncate">{label}</span>
    </button>
  );
}

/** The quiet outlined chip the brief asks for in the Ask panel's suggestions. */
export function QuietChip({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="ed-focus ed-serif w-full rounded-[10px] border border-ed-rule bg-ed-card px-3 py-2 text-left text-[14.5px] leading-[1.5] text-ed-ink transition-colors duration-150 hover:border-ed-gold/60 hover:bg-ed-gold-soft/40 disabled:opacity-50"
    >
      {label}
    </button>
  );
}

/** A number lifted out of prose so it can be seen. Used by the Ask answers and
 *  by the matter header. */
export function FigBox({
  value,
  label,
  tone = "neutral",
}: {
  value: string;
  label: string;
  tone?: EdTone;
}) {
  const accent =
    tone === "attn" ? "text-ed-attn" : tone === "gold" ? "text-ed-gold" : tone === "ok" ? "text-ed-sage" : "text-ed-ink";
  return (
    <div className="rounded-[10px] border border-ed-rule bg-ed-card px-3 py-2">
      <div className={`ed-mono text-[19px] leading-none tabular-nums ${accent}`}>{value}</div>
      <div className="ed-eyebrow mt-1.5 block truncate">{label}</div>
    </div>
  );
}

export function EdRule({ className = "" }: { className?: string }) {
  return <hr className={`border-0 border-t border-ed-rule ${className}`} />;
}

export function EdButton({
  label,
  icon: Icon,
  onClick,
  disabled,
  variant = "primary",
}: {
  label: string;
  icon?: ComponentType<{ className?: string }>;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "quiet";
}) {
  const skin =
    variant === "primary"
      ? "bg-ed-sage text-white border-ed-sage hover:brightness-110"
      : "bg-ed-card text-ed-ink border-ed-rule hover:border-ed-gold/60";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`ed-focus ed-serif inline-flex h-9 items-center gap-2 rounded-full border px-4 text-[14.5px] transition-colors duration-150 disabled:opacity-50 ${skin}`}
    >
      {Icon && <Icon className="h-4 w-4" />}
      {label}
    </button>
  );
}

// ---- the explain-first block, in the editorial face ---------------------------

export interface EdScreenHeader {
  /** Mono uppercase kicker above the title — MATTER, CHRONOLOGY, THE RECORD. */
  eyebrow: string;
  /** The Fraunces answer to "what am I looking at". */
  title: string;
  /** Mono meta beside the title: cause number, id, count. */
  meta?: ReactNode;
  /** One sentence a non-lawyer understands. */
  what: string;
  /** Where you are, right now. */
  where: ReactNode;
  /** What to do next. */
  next: ReactNode;
  /** Pills under the title — parties, tags, status. */
  pills?: ReactNode;
  /** The primary action(s). */
  action?: ReactNode;
  /** Anything wider that belongs above the fold — a progress strip, a filter bar. */
  extra?: ReactNode;
}

/**
 * THE EXPLAIN-FIRST BLOCK (ruling, Dave, 2026-08-10 — still binding), re-set in
 * the editorial face by D-LDUX-5. The labels are mono uppercase; the answers are
 * Fraunces. Nothing dense goes in here, and nothing dense may precede it.
 */
export function EdHeader({
  eyebrow,
  title,
  meta,
  what,
  where,
  next,
  pills,
  action,
  extra,
}: EdScreenHeader) {
  return (
    <header className="shrink-0 border-b border-ed-rule bg-ed-card px-6 py-5">
      <Eyebrow tick>{eyebrow}</Eyebrow>
      <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="ed-serif-display text-[24px] leading-[1.15] text-ed-ink">{title}</h2>
        {meta && <span className="ed-mono text-[12px] text-ed-muted">{meta}</span>}
      </div>

      {pills && <div className="mt-2.5 flex flex-wrap items-center gap-1.5">{pills}</div>}

      <p className="ed-serif mt-3 max-w-[72ch] text-[15px] leading-[1.65] text-ed-muted">{what}</p>

      <dl className="mt-4 grid max-w-[72ch] grid-cols-[104px_1fr] gap-x-4 gap-y-2">
        <dt className="ed-eyebrow pt-[5px]">Where you are</dt>
        <dd className="ed-serif text-[15px] leading-[1.55] text-ed-ink">{where}</dd>
        <dt className="ed-eyebrow pt-[5px]">Do next</dt>
        <dd className="ed-serif text-[15px] leading-[1.55] text-ed-ink">{next}</dd>
      </dl>

      {action && <div className="mt-4 flex flex-wrap items-center gap-2">{action}</div>}
      {extra && <div className="mt-4">{extra}</div>}
    </header>
  );
}

/**
 * Screen scaffold. The header is a prop and the content is children, so the
 * reading order cannot be inverted by a later edit.
 */
export function EdScreen({
  header,
  children,
  toolbar,
}: {
  header: EdScreenHeader;
  children: ReactNode;
  /** Renders between the header and the scrolling body — view toggle, filters. */
  toolbar?: ReactNode;
}) {
  return (
    <div className="ed-motion flex h-full min-h-0 flex-col bg-ed-paper text-ed-ink">
      <EdHeader {...header} />
      {toolbar}
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </div>
  );
}

/** Zero rows is a normal reading of the record, not a failure. */
export function EdEmpty({ line, hint }: { line: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <p className="ed-serif max-w-[52ch] text-[16px] leading-[1.65] text-ed-ink">{line}</p>
      {hint && <p className="ed-serif mt-2 max-w-[52ch] text-[14px] text-ed-muted">{hint}</p>}
    </div>
  );
}
