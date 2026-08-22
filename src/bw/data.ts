/**
 * Data for the BorrowWorks two-register operator app.
 *
 * Same posture as the rest of the client: this file names RESOURCES, never a
 * hostname, a key, a schema or a table. The broker decides what a resource is
 * and which books this caller may see. If a URL or a table name ever wants to
 * live here, the change belongs in server/broker/.
 */

import { brokerGet, postDecision } from "@/data/cube-broker";

/**
 * A nav entry, read from lending.view_registry.
 *
 * The nav is DATA. Adding a list surface is an INSERT into that table, not a
 * page build and not an edit to this file — which is the whole reason the
 * registry exists rather than an array of objects sitting in the bundle.
 */
export interface RegistryView {
  viewKey: string;
  label: string;
  resource: string;
  sortOrder: number;
}

export interface ScanRow {
  id: string;
  bookId: string;
  channel: string | null;
  occurredAt: string | null;
  agentRef: string | null;
  policyVersion: string | null;
  flagged: boolean;
  flagRule: string | null;
  disposition: string | null;
}

export interface LenderBook {
  id: string;
  slug: string;
  displayName: string;
}

/** A decision a human made on an exception. Written, never edited. */
export interface DecisionEntry {
  id: string;
  subjectRef: string;
  action: "confirmed" | "waived";
  reason: string;
  ruleVersion: string;
  decidedBy: string;
  decidedAt: string;
}

type Row = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

export async function listRegistryViews(): Promise<RegistryView[]> {
  const rows = await brokerGet<Row>("lending_view_registry", {});
  return rows
    .map((r) => ({
      viewKey: String(r.view_key ?? ""),
      label: String(r.label ?? ""),
      resource: String(r.resource ?? ""),
      sortOrder: Number(r.sort_order ?? 100),
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export async function listBooks(): Promise<LenderBook[]> {
  const rows = await brokerGet<Row>("lending_books", {});
  return rows.map((r) => ({
    id: String(r.id ?? ""),
    slug: String(r.slug ?? ""),
    displayName: String(r.display_name ?? ""),
  }));
}

export async function listScanRows(bookId: string): Promise<ScanRow[]> {
  const rows = await brokerGet<Row>("lending_interactions", { book: bookId });
  return rows.map((r) => ({
    id: String(r.id ?? ""),
    bookId: String(r.book_id ?? ""),
    channel: str(r.channel),
    occurredAt: str(r.occurred_at),
    agentRef: str(r.agent_ref),
    policyVersion: str(r.policy_version),
    flagged: r.flagged === true,
    flagRule: str(r.flag_rule),
    disposition: str(r.disposition),
  }));
}

export async function listDecisions(subjectRef: string): Promise<DecisionEntry[]> {
  const rows = await brokerGet<Row>("lending_decision_log", { subject_ref: subjectRef });
  return rows.map((r) => ({
    id: String(r.id ?? ""),
    subjectRef: String(r.subject_ref ?? ""),
    action: (r.action === "waived" ? "waived" : "confirmed") as "confirmed" | "waived",
    reason: String(r.reason ?? ""),
    ruleVersion: String(r.rule_version ?? ""),
    decidedBy: String(r.decided_by ?? ""),
    decidedAt: String(r.decided_at ?? ""),
  }));
}

/**
 * Record a decision. The DATA is fictional; the RECORD is real — who, what, why,
 * and the rule version in force — and the server, not this file, decides whether
 * the caller may write it and against which book.
 */
export async function recordDecision(input: {
  bookId: string;
  subjectKind: string;
  subjectRef: string;
  action: "confirmed" | "waived";
  reason: string;
  ruleVersion: string;
}): Promise<DecisionEntry> {
  return postDecision(input);
}
