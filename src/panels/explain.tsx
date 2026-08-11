import type { ComponentType, ReactNode } from "react";
import { getBrand } from "@/config";

/**
 * EXPLAIN-FIRST KIT — the Bolt evidence-portal idiom, made shared.
 *
 * RULING (Dave, 2026-08-10, binding): every screen leads with a plain-English
 * header block that answers three questions, in this order, ABOVE the functional
 * components:
 *
 *   1. What this screen is, in one sentence a non-lawyer understands.
 *   2. Where you are in the matter right now.
 *   3. What to do next — with the primary action right there.
 *
 * The dense panels render BELOW that block. Never first. `ExplainBlock` is the
 * only sanctioned way to render it, so the wording pattern and the reading order
 * cannot drift panel by panel.
 *
 * Everything else here is the rest of the idiom the ruling adopted: card sections
 * with large plain-English titles and one-line descriptions, evidence tiles with
 * type icons and coloured status chips, counts, and orientation step chips.
 *
 * These components use THEME TOKENS, not the literal hex of `legal/ld-kit`. They
 * render in the shell chrome, which follows the workspace's light/dark mode; the
 * six legal data panels keep their own fixed-light palette by earlier ruling.
 */

// ---- tone ---------------------------------------------------------------------

export type Tone = "neutral" | "info" | "good" | "warn" | "risk";

const TONE_CHIP: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground border-border",
  info: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/50 dark:text-sky-300 dark:border-sky-900",
  good: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-900",
  warn: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-900",
  risk: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-900",
};

const TONE_ICON: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground",
  info: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
  good: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  warn: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  risk: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
};

/**
 * Status vocabularies are open — a store can add a value at any time, and an
 * unknown value must read as plain and calm, never as an error. Anything
 * unrecognised falls through to neutral.
 */
const STATUS_TONES: Record<string, Tone> = {
  // settled / done
  reviewed: "good",
  complete: "good",
  completed: "good",
  complete_attested: "good",
  filed: "good",
  served: "good",
  produced: "good",
  responded: "good",
  closed: "good",
  done: "good",
  active: "good",
  // in flight / needs a person
  pending: "warn",
  draft: "warn",
  drafted: "warn",
  collected: "warn",
  prepared: "warn",
  sent: "warn",
  in_progress: "warn",
  in_force: "warn",
  open: "warn",
  todo: "warn",
  planned: "warn",
  awaiting_response: "warn",
  pending_review: "warn",
  scheduled: "warn",
  // wrong / contested
  flagged: "risk",
  objected: "risk",
  quashed: "risk",
  withdrawn: "risk",
  overdue: "risk",
  refused: "risk",
  failed: "risk",
  missing: "risk",
  disputed: "risk",
};

export function statusTone(value: string | null | undefined): Tone {
  const key = String(value ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  return STATUS_TONES[key] ?? "neutral";
}

/** Underscores out, first letter up. An unseen enum value still reads as words. */
export function humanizeStatus(value: string | null | undefined): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "Unknown";
  const spaced = raw.replace(/[_-]+/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

// ---- primitives ---------------------------------------------------------------

export function Chip({
  label,
  tone = "neutral",
  count,
  onClick,
  active,
  title,
}: {
  label: string;
  tone?: Tone;
  count?: number;
  onClick?: () => void;
  active?: boolean;
  title?: string;
}) {
  const body = (
    <>
      {label}
      {count !== undefined && (
        <span className="ml-1 font-mono tabular-nums opacity-70">{count}</span>
      )}
    </>
  );
  const base = `inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${TONE_CHIP[tone]}`;
  if (!onClick) {
    return (
      <span title={title} className={base}>
        {body}
      </span>
    );
  }
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`${base} transition-shadow hover:brightness-95 ${active ? "ring-2 ring-offset-1 ring-offset-background ring-foreground/30" : ""}`}
    >
      {body}
    </button>
  );
}

/**
 * The big obvious primary action the ruling asks for. It takes the profile's
 * brand accent rather than the near-monochrome `--primary` token, so "the thing
 * to do next" is the most saturated element on any screen.
 */
export function PrimaryAction({
  label,
  icon: Icon,
  onClick,
  disabled,
}: {
  label: string;
  icon?: ComponentType<{ className?: string }>;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{ backgroundColor: getBrand().accent }}
      className="inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium text-white shadow-sm transition hover:brightness-110 disabled:opacity-50"
    >
      {Icon && <Icon className="h-4 w-4" />}
      {label}
    </button>
  );
}

export function SecondaryAction({
  label,
  icon: Icon,
  onClick,
}: {
  label: string;
  icon?: ComponentType<{ className?: string }>;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-[13px] font-medium text-foreground shadow-sm transition-colors hover:bg-accent"
    >
      {Icon && <Icon className="h-4 w-4" />}
      {label}
    </button>
  );
}

// ---- the explain-first header block -------------------------------------------

export interface ExplainProps {
  /** Large plain-English screen title. */
  title: string;
  /** One sentence a non-lawyer understands. */
  what: string;
  /** Where you are in the matter right now. */
  where: ReactNode;
  /** What to do next. */
  next: ReactNode;
  /** The primary action, rendered inside the block beside "do next". */
  action?: ReactNode;
  /** Orientation strip / step chips, rendered under the three lines. */
  orientation?: ReactNode;
}

function ExplainLine({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground pt-[3px]">
        {label}
      </dt>
      <dd className="text-[13px] leading-snug text-foreground">{children}</dd>
    </>
  );
}

/**
 * The block that sits above every screen's functional components. Nothing dense
 * belongs in here — no tables, no grids, no row counts standing alone.
 */
export function ExplainBlock({ title, what, where, next, action, orientation }: ExplainProps) {
  return (
    <section
      data-explain-block
      className="shrink-0 border-b border-border bg-muted/40 px-4 py-3"
    >
      <h2 className="text-[15px] font-semibold leading-tight tracking-tight text-foreground">
        {title}
      </h2>
      <p className="mt-1 max-w-[78ch] text-[13px] leading-snug text-muted-foreground">{what}</p>

      {orientation && <div className="mt-3">{orientation}</div>}

      <dl className="mt-3 grid grid-cols-[92px_1fr] gap-x-3 gap-y-1.5">
        <ExplainLine label="Where you are">{where}</ExplainLine>
        <ExplainLine label="Do next">{next}</ExplainLine>
      </dl>

      {action && <div className="mt-3 flex flex-wrap items-center gap-2">{action}</div>}
    </section>
  );
}

/**
 * Screen scaffold. Enforces the reading order structurally: the explain block is
 * a prop, the dense components are children, and children can never precede it.
 */
export function ExplainScreen({
  explain,
  children,
}: {
  explain: ExplainProps;
  children: ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <ExplainBlock {...explain} />
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </div>
  );
}

// ---- orientation --------------------------------------------------------------

export type StepState = "done" | "current" | "pending" | "blocked";

export interface Step {
  id: string;
  label: string;
  state: StepState;
  detail?: string;
}

const STEP_CLASS: Record<StepState, string> = {
  done: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-900",
  current:
    "bg-sky-100 text-sky-800 border-sky-300 font-semibold dark:bg-sky-950 dark:text-sky-200 dark:border-sky-800",
  pending: "bg-muted text-muted-foreground border-border",
  blocked:
    "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-900",
};

/**
 * "Where am I / what do I do next" at a glance: a progress bar plus one chip per
 * step, current step highlighted. Zero steps renders a line, not an empty rail —
 * a matter with no recorded phases is a normal reading.
 */
export function ProgressStrip({ steps }: { steps: Step[] }) {
  if (steps.length === 0) {
    return (
      <p className="text-[12px] text-muted-foreground">
        No stages recorded for this matter yet.
      </p>
    );
  }
  const done = steps.filter((s) => s.state === "done").length;
  const currentIndex = steps.findIndex((s) => s.state === "current");
  const position = currentIndex >= 0 ? currentIndex + 1 : done || 1;
  const pct = Math.round((done / steps.length) * 100);

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[12px] font-medium text-foreground">
          Step {position} of {steps.length}
        </span>
        <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
          {pct}% complete
        </span>
      </div>
      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: getBrand().accent }}
        />
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {steps.map((s) => (
          <span
            key={s.id}
            title={s.detail}
            className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] ${STEP_CLASS[s.state]}`}
          >
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ---- card sections ------------------------------------------------------------

export function CardGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid gap-3 p-4 [grid-template-columns:repeat(auto-fill,minmax(240px,1fr))]">
      {children}
    </div>
  );
}

/**
 * A card, not a table row: large plain-English title, one line saying what it is
 * for, a count, status chips, and one obvious way in.
 */
export function SectionCard({
  title,
  description,
  count,
  countLabel,
  chips,
  icon: Icon,
  tone = "neutral",
  actionLabel,
  onOpen,
  emphasis,
}: {
  title: string;
  description: string;
  count?: number | string;
  countLabel?: string;
  chips?: ReactNode;
  icon?: ComponentType<{ className?: string }>;
  tone?: Tone;
  actionLabel: string;
  onOpen: () => void;
  /** The one card on the screen that should pull the eye first. */
  emphasis?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`group flex flex-col rounded-lg border bg-card p-4 text-left shadow-sm transition hover:shadow-md ${
        emphasis ? "border-transparent ring-2" : "border-border hover:border-foreground/20"
      }`}
      style={emphasis ? { boxShadow: `0 0 0 2px ${getBrand().accent}` } : undefined}
    >
      <div className="flex items-start gap-3">
        {Icon && (
          <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${TONE_ICON[tone]}`}
          >
            <Icon className="h-[18px] w-[18px]" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-semibold leading-tight tracking-tight text-foreground">
            {title}
          </h3>
          <p className="mt-1 text-[12px] leading-snug text-muted-foreground">{description}</p>
        </div>
      </div>

      {(count !== undefined || chips) && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {count !== undefined && (
            <span className="font-mono text-[20px] font-semibold leading-none tabular-nums text-foreground">
              {count}
            </span>
          )}
          {countLabel && (
            <span className="mr-1 text-[12px] text-muted-foreground">{countLabel}</span>
          )}
          {chips}
        </div>
      )}

      <span
        className="mt-3 inline-flex items-center text-[12px] font-medium"
        style={{ color: getBrand().accent }}
      >
        {actionLabel} →
      </span>
    </button>
  );
}

// ---- evidence tiles -----------------------------------------------------------

export function TileGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid gap-2.5 p-3 [grid-template-columns:repeat(auto-fill,minmax(210px,1fr))]">
      {children}
    </div>
  );
}

/**
 * One document, as a tile: type icon, plain title, what kind of thing it is, and
 * a coloured chip saying whether anyone has dealt with it.
 */
export function EvidenceTile({
  title,
  kind,
  date,
  status,
  icon: Icon,
  tone = "neutral",
  selected,
  onOpen,
}: {
  title: string;
  kind: string;
  date?: string;
  status: string;
  icon: ComponentType<{ className?: string }>;
  tone?: Tone;
  selected?: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`flex flex-col rounded-lg border bg-card p-3 text-left shadow-sm transition hover:shadow-md ${
        selected ? "border-foreground/40 ring-1 ring-foreground/20" : "border-border hover:border-foreground/20"
      }`}
    >
      <div className="flex items-start gap-2.5">
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${TONE_ICON[tone]}`}
        >
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-[13px] font-medium leading-snug text-foreground">
            {title}
          </p>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{kind}</p>
        </div>
      </div>
      <div className="mt-2.5 flex items-center justify-between gap-2">
        <Chip label={humanizeStatus(status)} tone={tone} />
        {date && (
          <span className="font-mono text-[10px] tabular-nums text-muted-foreground">{date}</span>
        )}
      </div>
    </button>
  );
}
