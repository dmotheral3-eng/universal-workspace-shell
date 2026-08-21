/**
 * Client half of the lending surface.
 *
 * Same posture as `cube-broker.ts` and for the same reason: this file knows no
 * Cube hostname, no key, no table name, no tenant id and no book id. It names
 * a resource, the server decides everything else — including WHICH BOOKS this
 * caller may see, which is resolved from master's entitlement register inside
 * the broker and can never be influenced from here.
 *
 * If a Cube URL, a key, or a `book_id` the user chose ever wants to live in
 * this file, that is the signal the change belongs in server/broker/.
 */

import { brokerGet } from "./cube-broker";

export interface LendingBook {
  id: string;
  slug: string;
  displayName: string;
  tribeLabel: string | null;
  isSpecimen: boolean;
  status: string | null;
}

export interface LendingDecision {
  id: string;
  bookId: string;
  ref: string | null;
  decidedAt: string | null;
  outcome: string | null;
  modelVersion: string | null;
  reviewer: string | null;
  reviewedAt: string | null;
  reviewAction: string | null;
  retentionUntil: string | null;
  correctsId: string | null;
}

export interface LendingInteraction {
  id: string;
  bookId: string;
  channel: string | null;
  occurredAt: string | null;
  agentRef: string | null;
  policyVersion: string | null;
  flagged: boolean;
  flagRule: string | null;
  disposition: string | null;
  correctsId: string | null;
}

export interface LendingChange {
  id: string;
  bookId: string;
  path: string | null;
  intent: string | null;
  author: string | null;
  authorKind: string | null;
  reasoning: string | null;
  status: string | null;
  correctsId: string | null;
  recordedAt: string | null;
}

export interface LendingAttestation {
  id: string;
  bookId: string;
  kind: string | null;
  subject: string | null;
  status: string | null;
  effectiveAt: string | null;
  expiresAt: string | null;
  correctsId: string | null;
}

type Row = Record<string, unknown>;

const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const req = (v: unknown): string => (typeof v === "string" ? v : "");

export async function listBooks(): Promise<LendingBook[]> {
  const rows = await brokerGet<Row>("lending_books");
  return rows.map((r) => ({
    id: req(r.id),
    slug: req(r.slug),
    displayName: str(r.display_name) ?? req(r.slug),
    tribeLabel: str(r.tribe_label),
    isSpecimen: r.is_specimen === true,
    status: str(r.status),
  }));
}

/** Every evidence read narrows to one book. No book selected, no rows fetched. */
function bookParam(bookId: string): Record<string, string> {
  return { book: bookId };
}

export async function listDecisions(bookId: string): Promise<LendingDecision[]> {
  const rows = await brokerGet<Row>("lending_decisions", bookParam(bookId));
  return rows.map((r) => ({
    id: req(r.id),
    bookId: req(r.book_id),
    ref: str(r.decision_ref),
    decidedAt: str(r.decided_at),
    outcome: str(r.outcome),
    modelVersion: str(r.model_version),
    reviewer: str(r.reviewer),
    reviewedAt: str(r.reviewed_at),
    reviewAction: str(r.review_action),
    retentionUntil: str(r.retention_until),
    correctsId: str(r.corrects_id),
  }));
}

export async function listInteractions(bookId: string): Promise<LendingInteraction[]> {
  const rows = await brokerGet<Row>("lending_interactions", bookParam(bookId));
  return rows.map((r) => ({
    id: req(r.id),
    bookId: req(r.book_id),
    channel: str(r.channel),
    occurredAt: str(r.occurred_at),
    agentRef: str(r.agent_ref),
    policyVersion: str(r.policy_version),
    flagged: r.flagged === true,
    flagRule: str(r.flag_rule),
    disposition: str(r.disposition),
    correctsId: str(r.corrects_id),
  }));
}

export async function listChanges(bookId: string): Promise<LendingChange[]> {
  const rows = await brokerGet<Row>("lending_changes", bookParam(bookId));
  return rows.map((r) => ({
    id: req(r.id),
    bookId: req(r.book_id),
    path: str(r.path),
    intent: str(r.intent),
    author: str(r.author),
    authorKind: str(r.author_kind),
    reasoning: str(r.reasoning),
    status: str(r.status),
    correctsId: str(r.corrects_id),
    recordedAt: str(r.recorded_at),
  }));
}

export async function listAttestations(bookId: string): Promise<LendingAttestation[]> {
  const rows = await brokerGet<Row>("lending_attestations", bookParam(bookId));
  return rows.map((r) => ({
    id: req(r.id),
    bookId: req(r.book_id),
    kind: str(r.kind),
    subject: str(r.subject),
    status: str(r.status),
    effectiveAt: str(r.effective_at),
    expiresAt: str(r.expires_at),
    correctsId: str(r.corrects_id),
  }));
}
