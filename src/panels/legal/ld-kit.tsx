import type { ReactNode } from "react";

/**
 * Shared presentation kit for the six legal data panels.
 *
 * PALETTE RULING (2026-08-09) — this supersedes the dark values in the profile's
 * brand block. The idiom is Linear: white ground, Inter 13px body, hairline
 * borders, sentence case, near-monochrome pills.
 *
 * THE ACCENT IS USED IN EXACTLY ONE PLACE across all six panels: the recovery
 * outlook headline figure (`LD.accent`, consumed only by `LdAccentFigure`). If a
 * second element ever wants it, the answer is no — pick which one earns it.
 *
 * ⟦AMENDED 2026-09-01, ruling (ii) of COS-1584, and the amendment is scoped so the
 * clause above still holds where it was aimed. The original text read: "The colours
 * are literal hex, not theme tokens, on purpose: these panels must read the same
 * whether the shell around them is running light or dark." That reasoning was
 * written when the only thing around these panels was the shadcn shell, and it is
 * still exactly right there — the :root values in src/index.css carry these same
 * seven hexes byte-for-byte, so every profile that is not wearing the semester face
 * renders identically to before this edit.
 *
 * What changed is that a panel can now sit inside the KIT's chrome, which is
 * near-black. Dave, 2026-09-01: dark panels inside dark chrome, "never a white
 * void". A literal hex cannot answer to two grounds, so the values move into CSS
 * variables and the generated [data-kit-mode] blocks override them for that subtree
 * ONLY. The panels still do not follow the shell's light/dark toggle; they follow
 * the KIT's mode, which is a different and narrower thing.
 *
 * The values below are therefore not a second source of truth: the light defaults
 * live at :root in index.css, and the kit overrides are GENERATED from the kit's
 * own token block by scripts/generate-kit-css.mjs. Nothing here is typed twice.⟧
 */
export const LD = {
  ground: "var(--ld-ground)",
  ink: "var(--ld-ink)",
  inkMuted: "var(--ld-ink-muted)",
  inkFaint: "var(--ld-ink-faint)",
  hairline: "var(--ld-hairline)",
  wash: "var(--ld-wash)",
  accent: "var(--ld-accent)",
} as const;

export const ldText = "font-sans text-[13px] leading-[1.5]";

/** Underscores out, first letter up, everything else left alone. Enum values we
 *  have never seen still render as words rather than as raw column soup. */
export function humanize(value: string | null | undefined): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const spaced = raw.replace(/[_-]+/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

const whole = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const cents = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Whole dollars stay whole; anything with a fraction shows both cents, so a
 *  rate of 385.5 never reads as $385.5. */
export function money(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return Number.isInteger(value) ? whole.format(value) : cents.format(value);
}

/** A one-sided range is stated as one-sided. A lone low bound shown bare would
 *  read as a firm figure. */
export function moneyRange(low: number | null, high: number | null): string {
  if (low === null && high === null) return "—";
  if (low !== null && high !== null) {
    return low === high ? money(low) : `${money(low)} – ${money(high)}`;
  }
  return low !== null ? `From ${money(low)}` : `Up to ${money(high)}`;
}

export function hours(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const rounded = Math.round(value * 100) / 100;
  return `${rounded} h`;
}

export function rate(value: number | null | undefined): string {
  return value === null || value === undefined || !Number.isFinite(value)
    ? "—"
    : `${money(value)}/h`;
}

/** Dates arrive as date or timestamp strings; anything unparseable is shown raw
 *  rather than swallowed, and nothing here throws. */
export function dateOnly(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toISOString().slice(0, 10);
}

export function dateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return `${d.toISOString().slice(0, 10)} ${d.toISOString().slice(11, 16)}`;
}

// ---- surfaces ----------------------------------------------------------------

export function LdSurface({ children }: { children: ReactNode }) {
  return (
    <div
      className={`flex h-full flex-col overflow-hidden ${ldText}`}
      style={{ background: LD.ground, color: LD.ink }}
    >
      {children}
    </div>
  );
}

export function LdHeader({ title, meta }: { title: string; meta?: ReactNode }) {
  return (
    <div
      className="flex items-baseline justify-between gap-3 border-b px-3 py-2"
      style={{ borderColor: LD.hairline }}
    >
      <span className="text-[13px] font-medium">{title}</span>
      {meta ? (
        <span className="truncate text-[12px]" style={{ color: LD.inkMuted }}>
          {meta}
        </span>
      ) : null}
    </div>
  );
}

export function LdBody({ children }: { children: ReactNode }) {
  return <div className="min-h-0 flex-1 overflow-auto">{children}</div>;
}

/**
 * EXPLAIN-FIRST BLOCK, in this file's palette.
 *
 * Ruling (Dave, 2026-08-10, binding): every screen leads with plain English —
 * what this is, where you are, what to do next — ABOVE the dense component. These
 * six panels are dense by nature, which is exactly why they need it.
 *
 * It is written here rather than reusing `panels/explain` because these panels
 * are pinned to the fixed light palette above and must not follow the shell's
 * light/dark mode.
 */
export function LdExplain({
  what,
  where,
  next,
}: {
  what: string;
  where: ReactNode;
  next: ReactNode;
}) {
  return (
    <div
      className="shrink-0 border-b px-3 py-2.5"
      style={{ borderColor: LD.hairline, background: LD.wash }}
    >
      <p className="text-[12px] leading-[1.5]" style={{ color: LD.ink }}>
        {what}
      </p>
      <dl className="mt-2 grid grid-cols-[78px_1fr] gap-x-2.5 gap-y-1">
        <dt
          className="pt-[2px] text-[10px] font-semibold uppercase tracking-wider"
          style={{ color: LD.inkFaint }}
        >
          Where
        </dt>
        <dd className="text-[12px]" style={{ color: LD.inkMuted }}>
          {where}
        </dd>
        <dt
          className="pt-[2px] text-[10px] font-semibold uppercase tracking-wider"
          style={{ color: LD.inkFaint }}
        >
          Do next
        </dt>
        <dd className="text-[12px]" style={{ color: LD.inkMuted }}>
          {next}
        </dd>
      </dl>
    </div>
  );
}

export function LdFooter({ children }: { children: ReactNode }) {
  return (
    <div
      className="flex items-center justify-between gap-3 border-t px-3 py-2 text-[12px]"
      style={{ borderColor: LD.hairline, background: LD.wash }}
    >
      {children}
    </div>
  );
}

/** Every panel's zero-row state. Empty is a normal reading, not a failure. */
export function LdEmpty({ line }: { line: string }) {
  return (
    <div className="flex h-full items-center justify-center px-6 py-10 text-center">
      <p className="text-[12px]" style={{ color: LD.inkMuted }}>
        {line}
      </p>
    </div>
  );
}

export function LdNote({ children }: { children: ReactNode }) {
  return (
    <p className="px-3 py-2 text-[12px]" style={{ color: LD.inkFaint }}>
      {children}
    </p>
  );
}

/** The one accented element in the set. See the ruling at the top of this file. */
export function LdAccentFigure({ children }: { children: ReactNode }) {
  return (
    <span
      className="font-mono text-[26px] leading-none tracking-tight tabular-nums"
      style={{ color: LD.accent }}
    >
      {children}
    </span>
  );
}

// ---- pills -------------------------------------------------------------------

export type LdTone = "neutral" | "positive" | "attention" | "critical";

/** Same amendment as LD above: light values at :root, kit values generated. A pill
 *  is the one element in these panels that carries colour even with no accent, so
 *  leaving it on light hex would put four bright chips on a near-black panel. */
const TONES: Record<LdTone, { bg: string; fg: string; border: string }> = {
  neutral: { bg: "var(--ld-tone-neutral-bg)", fg: "var(--ld-tone-neutral-fg)", border: "var(--ld-tone-neutral-border)" },
  positive: { bg: "var(--ld-tone-positive-bg)", fg: "var(--ld-tone-positive-fg)", border: "var(--ld-tone-positive-border)" },
  attention: { bg: "var(--ld-tone-attention-bg)", fg: "var(--ld-tone-attention-fg)", border: "var(--ld-tone-attention-border)" },
  critical: { bg: "var(--ld-tone-critical-bg)", fg: "var(--ld-tone-critical-fg)", border: "var(--ld-tone-critical-border)" },
};

/** Unknown values are a certainty, not an edge case — a status vocabulary can be
 *  extended in the database at any time. Anything unrecognised gets the neutral
 *  pill and its own text; no panel ever white-screens on a value it has not met. */
const STATUS_TONES: Record<string, LdTone> = {
  served: "positive",
  filed: "positive",
  responded: "positive",
  complete: "positive",
  completed: "positive",
  closed: "positive",
  produced: "positive",
  draft: "attention",
  drafted: "attention",
  prepared: "attention",
  pending: "attention",
  sent: "attention",
  in_progress: "attention",
  awaiting_response: "attention",
  planned: "attention",
  objected: "critical",
  quashed: "critical",
  withdrawn: "critical",
  overdue: "critical",
  refused: "critical",
  failed: "critical",
};

const PRIORITY_TONES: Record<string, LdTone> = {
  critical: "critical",
  urgent: "critical",
  p0: "critical",
  "1": "critical",
  high: "critical",
  p1: "attention",
  medium: "attention",
  moderate: "attention",
  normal: "attention",
  p2: "attention",
  "2": "attention",
  low: "neutral",
  p3: "neutral",
  "3": "neutral",
  deferred: "neutral",
};

function lookup(map: Record<string, LdTone>, value: string | null | undefined): LdTone {
  const key = String(value ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  return map[key] ?? "neutral";
}

export function statusTone(value: string | null | undefined): LdTone {
  return lookup(STATUS_TONES, value);
}

export function priorityTone(value: string | null | undefined): LdTone {
  return lookup(PRIORITY_TONES, value);
}

export function LdPill({
  label,
  tone = "neutral",
  title,
}: {
  label: string;
  tone?: LdTone;
  title?: string;
}) {
  const t = TONES[tone] ?? TONES.neutral;
  return (
    <span
      title={title}
      className="inline-flex items-center rounded-[4px] border px-1.5 py-[1px] text-[11px] font-medium whitespace-nowrap"
      style={{ background: t.bg, color: t.fg, borderColor: t.border }}
    >
      {label}
    </span>
  );
}

/** Convenience: pill for an enum column, tone resolved, label humanised, and a
 *  quiet placeholder when the column is null. */
export function LdEnumPill({
  value,
  kind,
}: {
  value: string | null | undefined;
  kind: "status" | "priority";
}) {
  if (!value) return null;
  const tone = kind === "status" ? statusTone(value) : priorityTone(value);
  return <LdPill label={humanize(value)} tone={tone} title={`${kind}: ${value}`} />;
}

// ---- jsonb rendering ---------------------------------------------------------

/** jsonb can arrive parsed or as a string; both are handled, neither throws. */
export function parseJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

const LABEL_KEYS = ["label", "name", "title", "item", "description", "component", "head"];
const AMOUNT_KEYS = ["amount", "value", "dollars", "total", "subtotal", "amount_target", "sum"];

function pick(obj: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null && obj[k] !== "") return obj[k];
  }
  return undefined;
}

function itemise(entry: unknown, index: number): { label: string; value: string } {
  if (entry === null || entry === undefined) return { label: `Item ${index + 1}`, value: "—" };
  if (typeof entry !== "object") return { label: String(entry), value: "" };
  const obj = entry as Record<string, unknown>;
  const label = pick(obj, LABEL_KEYS);
  const amount = pick(obj, AMOUNT_KEYS);
  const numeric = typeof amount === "number" ? amount : Number(amount);
  return {
    label: label !== undefined ? String(label) : `Item ${index + 1}`,
    value:
      amount === undefined
        ? ""
        : Number.isFinite(numeric)
          ? money(numeric)
          : String(amount),
  };
}

/**
 * Array-shaped jsonb renders as an itemized list; anything else (object, scalar,
 * unparseable string) renders raw-pretty. Deliberately tolerant — the shape of
 * line_items / breakdown is not guaranteed by a column type.
 */
export function LdJson({ value, emptyLine }: { value: unknown; emptyLine?: string }) {
  const parsed = parseJson(value);
  if (parsed === null || parsed === undefined || parsed === "") {
    return emptyLine ? (
      <p className="text-[12px]" style={{ color: LD.inkFaint }}>
        {emptyLine}
      </p>
    ) : null;
  }

  if (Array.isArray(parsed)) {
    if (parsed.length === 0) {
      return emptyLine ? (
        <p className="text-[12px]" style={{ color: LD.inkFaint }}>
          {emptyLine}
        </p>
      ) : null;
    }
    return (
      <ul className="flex flex-col">
        {parsed.map((entry, i) => {
          const { label, value: amount } = itemise(entry, i);
          return (
            <li
              key={i}
              className="flex items-baseline justify-between gap-3 border-b py-1 last:border-b-0"
              style={{ borderColor: LD.hairline }}
            >
              <span className="min-w-0 flex-1 break-words">{label}</span>
              {amount ? <span className="font-mono tabular-nums">{amount}</span> : null}
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <pre
      className="overflow-auto rounded-[4px] border p-2 font-mono text-[11px] leading-[1.45] whitespace-pre-wrap"
      style={{ borderColor: LD.hairline, background: LD.wash, color: LD.inkMuted }}
    >
      {typeof parsed === "object" ? JSON.stringify(parsed, null, 2) : String(parsed)}
    </pre>
  );
}
