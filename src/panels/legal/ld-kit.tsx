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
 * The colours are literal hex, not theme tokens, on purpose: these panels must
 * read the same whether the shell around them is running light or dark.
 */
export const LD = {
  ground: "#FFFFFF",
  ink: "#111113",
  inkMuted: "#6E7076",
  inkFaint: "#9A9CA3",
  hairline: "#EAEAEC",
  wash: "#FAFAFB",
  accent: "#5E6AD2",
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

const TONES: Record<LdTone, { bg: string; fg: string; border: string }> = {
  neutral: { bg: "#F5F5F6", fg: "#5C5F66", border: "#E7E7EA" },
  positive: { bg: "#F1F9F4", fg: "#1B7A4B", border: "#DCEFE3" },
  attention: { bg: "#FDF7EC", fg: "#8A6216", border: "#F2E4C8" },
  critical: { bg: "#FDF3F3", fg: "#A03030", border: "#F3DADA" },
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
