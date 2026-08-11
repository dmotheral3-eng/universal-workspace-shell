import type { Item } from "@/data";
import { humanize } from "../editorial-kit";

/**
 * THE FACT — the atom both chronology views are built from.
 *
 * DERIVED FIELDS, DECLARED (D-LDUX-5). This is a presentation change: no schema
 * moved, no column was added, and the panel data layer is exactly the one that
 * was here before. Everything below is read off the existing `Item`:
 *
 *   headline  ← item.title      (cube: `timeline_events.event_type`, an enum, so
 *                                it is humanised — `claim_denied` → "Claim denied")
 *   summary   ← item.summary    (`description`)
 *   date      ← item.date       (`event_date`)
 *   who       ← item.type       (cube: `actor`, case store: `who`. In the
 *                                healthcare demo this column carries an encounter
 *                                kind rather than a person, so the chip is titled
 *                                "who or what the record attributes this to" and
 *                                the filter facet is labelled "Who" — never
 *                                "Person" — so it stays true in both profiles.)
 *   sources   ← item.evidenceSource  (cube: `provenance_kind:provenance_ref — note`)
 *   issues    ← item.statute (public store only) and item.status (`phase`)
 *
 *   type      ← NOT IN THE RECORD. There is no fact-type column in either store.
 *               It is inferred here from the event type, the phase and the
 *               description, by the keyword table below, and it always resolves —
 *               the fallback is "event", which is the honest answer for "the
 *               record says something happened and does not say what kind".
 *               Colour is never the only carrier: every type renders as a dot
 *               AND a mono label.
 */

export type FactType = "filing" | "evidence" | "communication" | "deadline" | "event";

export interface FactTypeSpec {
  id: FactType;
  label: string;
  /** Tailwind text/bg colour classes for the dot. Paired with the label, always. */
  dot: string;
  /** What this type means, in one line, for the tooltip and the legend. */
  gloss: string;
}

export const FACT_TYPES: Record<FactType, FactTypeSpec> = {
  filing: {
    id: "filing",
    label: "Filing",
    dot: "bg-ed-sage",
    gloss: "Something went to, or came from, a court or an agency.",
  },
  evidence: {
    id: "evidence",
    label: "Evidence",
    dot: "bg-ed-gold",
    gloss: "A record, report or exhibit entered the file.",
  },
  communication: {
    id: "communication",
    label: "Communication",
    dot: "bg-ed-ink/55",
    gloss: "Somebody said something to somebody — letter, call, demand, meeting.",
  },
  deadline: {
    id: "deadline",
    label: "Deadline",
    dot: "bg-ed-attn",
    gloss: "A clock. Something expires, is due, or must be answered by a date.",
  },
  event: {
    id: "event",
    label: "Event",
    dot: "bg-ed-muted",
    gloss: "It happened. The record does not say what kind of thing it was.",
  },
};

export const FACT_TYPE_ORDER: FactType[] = [
  "filing",
  "evidence",
  "communication",
  "deadline",
  "event",
];

/** Order matters: a "motion filing deadline" is a deadline before it is a filing,
 *  and the clock is the thing a reader must not miss. */
const TYPE_PATTERNS: [FactType, RegExp][] = [
  [
    "deadline",
    /\b(deadline|due|expir|lapse|limitation|statute of limitations|\bsol\b|bar date|tickler|calendar|must be (filed|served|answered)|no later than|window closes)\b/i,
  ],
  [
    "filing",
    /\b(fil(e|ed|ing)|motion|petition|complaint|answer|plead|order|judg(e)?ment|docket|court|hearing|trial|served|service of|subpoena|discovery request|notice of (removal|appeal|hearing)|dismiss|remand|appeal)\b/i,
  ],
  [
    "communication",
    /\b(letter|email|e-mail|call|phone|voicemail|correspond|demand|conferr?|conference|meeting|message|memo|notice (sent|to)|spoke|contacted|respon(se|ded) to)\b/i,
  ],
  [
    "evidence",
    /\b(record|report|photo|image|invoice|estimate|statement|exhibit|produc(e|ed|tion)|document|inspection|apprais|bill|receipt|transcript|deposition|affidavit|declaration|log|chart|scan|test result)\b/i,
  ],
];

export function deriveFactType(item: Item): FactType {
  const hay = [item.title, item.status, item.summary].filter(Boolean).join(" ");
  for (const [type, pattern] of TYPE_PATTERNS) {
    if (pattern.test(hay)) return type;
  }
  return "event";
}

export interface Fact {
  item: Item;
  id: string;
  /** ISO date as the store gave it, sliced to the day. "" when absent. */
  iso: string;
  /** Parsed date, or null when the store's value will not parse. */
  when: Date | null;
  /** Sortable key — undated facts sort last, never crash a comparator. */
  sortKey: number;
  type: FactType;
  headline: string;
  summary: string;
  who: string[];
  sources: string[];
  issues: string[];
  /** Dated after today. Gathers under the COMING UP divider. */
  future: boolean;
}

function parseDay(raw: string): Date | null {
  if (!raw) return null;
  const day = raw.slice(0, 10);
  const d = new Date(`${day}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** One line, stated the way a lawyer would state it. An enum event type becomes
 *  a sentence; a blank one falls back to the first clause of the description, so
 *  a fact card is never headed by an empty string. */
function headlineOf(item: Item): string {
  const title = humanize(item.title);
  if (title) return title;
  const first = String(item.summary ?? "").trim().split(/(?<=[.;])\s+/)[0] ?? "";
  return first ? first.slice(0, 120) : "Unlabelled entry";
}

export function toFact(item: Item, today: Date): Fact {
  const when = parseDay(item.date);
  const issues = [item.statute, item.status]
    .map((v) => String(v ?? "").trim())
    .filter((v) => v !== "");
  return {
    item,
    id: item.id,
    iso: item.date ? item.date.slice(0, 10) : "",
    when,
    sortKey: when ? when.getTime() : Number.POSITIVE_INFINITY,
    type: deriveFactType(item),
    headline: headlineOf(item),
    summary: String(item.summary ?? "").trim(),
    who: item.type ? [String(item.type).trim()] : [],
    sources: item.evidenceSource ? [String(item.evidenceSource).trim()] : [],
    issues,
    future: when ? when.getTime() > today.getTime() : false,
  };
}

export function toFacts(items: Item[], today = startOfDay(new Date())): Fact[] {
  return items.map((i) => toFact(i, today)).sort((a, b) => a.sortKey - b.sortKey);
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

// ---- formatting ---------------------------------------------------------------

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "MARCH 2026" for the sticky divider. */
export function monthLabel(d: Date): string {
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** "Mar 26" for the left rail. */
export function dayLabel(d: Date): string {
  return `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`;
}

export function yearOf(d: Date): string {
  return String(d.getFullYear());
}

export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** A stretch of silence, in the words a reader would use. */
export function gapLabel(days: number): string {
  if (days >= 730) return `${Math.round(days / 365)} years, no record`;
  if (days >= 365) return `${(days / 365).toFixed(1).replace(/\.0$/, "")} years, no record`;
  if (days >= 60) return `${Math.round(days / 30)} months, no record`;
  return `${days} days, no record`;
}

// ---- grouping -----------------------------------------------------------------

export interface MonthGroup {
  key: string;
  label: string;
  /** Facts still standing after the filters. */
  facts: Fact[];
  /** How many this month lost to the filters — the divider survives and says so. */
  hidden: number;
}

/**
 * Month/year groups, built from the UNFILTERED set so that a divider never
 * disappears just because its facts did. A month that filtered down to nothing
 * still renders, and still says how many it is holding back.
 */
export function groupByMonth(all: Fact[], visible: Set<string>): MonthGroup[] {
  const groups: MonthGroup[] = [];

  for (const fact of all) {
    const key = fact.when ? monthKey(fact.when) : "undated";
    const label = fact.when ? monthLabel(fact.when) : "No date recorded";
    const last = groups[groups.length - 1];
    const group = last && last.key === key ? last : undefined;
    if (!group) groups.push({ key, label, facts: [], hidden: 0 });
    const target = groups[groups.length - 1];
    if (visible.has(fact.id)) target.facts.push(fact);
    else target.hidden += 1;
  }

  return groups;
}
