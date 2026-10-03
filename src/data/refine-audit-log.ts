/**
 * Refine's audit log provider, over the change record (BOR-133).
 *
 * THE RECORD IS WRITTEN ON THE SERVER, NOT HERE. The broker's write door hands
 * every change to the wall, and the wall writes the change and its evidence row
 * in one transaction — allowed or refused. So by the time Refine calls
 * `create` (it does, after every mutation), the row already exists. A second
 * write from the browser would be a second opinion about what happened, and
 * the two could disagree. `create` therefore writes nothing.
 *
 * WHAT THIS FILE IS FOR is the read: `useLogList({ resource, meta: { id } })`
 * returns the rows filed under `<resource>/<id>/…`, oldest change last, each
 * with what the row was and what it became. That is the packet on a vendor's
 * detail — it comes from the log, not from the screen's own memory.
 *
 * THE SHAPE, column → Refine's `ILog`:
 *
 *   id             → id
 *   recorded_at    → createdAt
 *   intent         → action           ("update", …)
 *   author         → author.name      author_kind → author.kind
 *   after_state    → data
 *   before_state   → previousData
 *   path           → resource (first segment) and meta.path (whole)
 *   status         → meta.status      "applied" | "refused" | …
 *   reasoning      → meta.reasoning   on a refusal, the wall's code
 *
 * `update` IS REFUSED. Refine uses it to rename a log entry; the ticket scoped
 * it to status and approvals. There is no server door that changes either —
 * the table is append-only by trigger, and who may approve a change is a rule
 * nobody has written yet. A door that pretended otherwise would be the screen
 * reporting an approval the record does not hold.
 */

import type { AuditLogProvider, ILog } from "@refinedev/core";
import { BrokerError, brokerGet } from "./cube-broker";
import { isRefusalCode } from "@/shell/door-email-claim";

/** The brokered resource the change record is read through. */
export const CHANGE_LOG_RESOURCE = "lending_changes";

/** One row of the change record, as the broker returns it. */
export interface ChangeRow {
  id: string;
  tenant_id: string;
  book_id: string;
  path: string;
  intent: string;
  author: string;
  author_kind: string;
  reasoning: string | null;
  status: string;
  corrects_id: string | null;
  recorded_at: string;
  before_state: unknown;
  after_state: unknown;
}

/** The same alphabet the server holds a path prefix to. Anything else is not asked. */
const SEGMENT = /^[A-Za-z0-9_-]+$/;

/**
 * `vendors` + `862552ac-…` → `vendors/862552ac-…/`.
 *
 * The trailing slash is deliberate: without it `vendors/1` is also a prefix of
 * `vendors/10/…`. A resource alone (`vendors/`) is every change filed under it.
 * Returns null when either part could not be a path segment — the caller then
 * answers with no rows rather than with everything.
 */
export function pathPrefix(resource: string, id?: unknown): string | null {
  if (!SEGMENT.test(resource)) return null;
  if (id === undefined || id === null || id === "") return `${resource}/`;
  const key = String(id);
  if (!SEGMENT.test(key)) return null;
  return `${resource}/${key}/`;
}

export function toLog(row: ChangeRow): ILog {
  return {
    id: row.id,
    createdAt: row.recorded_at,
    action: row.intent,
    resource: row.path.split("/")[0] ?? "",
    author: { name: row.author, kind: row.author_kind },
    data: row.after_state ?? null,
    previousData: row.before_state ?? null,
    meta: {
      path: row.path,
      status: row.status,
      reasoning: row.reasoning,
      corrects_id: row.corrects_id,
      book_id: row.book_id,
    },
  };
}

export const changeLogProvider: AuditLogProvider = {
  /**
   * No write. See the header. Resolves with where the record actually is, so a
   * caller inspecting the result learns the truth instead of an invented id.
   */
  create: async () => ({ recorded: "server" }),

  get: async ({ resource, action, meta }) => {
    const prefix = pathPrefix(resource, meta?.id);
    if (!prefix) return [];

    const params: Record<string, string> = { path_prefix: prefix };
    if (typeof meta?.book_id === "string" && meta.book_id) params.book = meta.book_id;

    let rows: ChangeRow[];
    try {
      rows = await brokerGet<ChangeRow>(CHANGE_LOG_RESOURCE, params);
    } catch (e) {
      // A refusal is an answer: someone with no access to the record has an
      // empty log, not a broken one. Everything else still throws its code.
      const code = (e as { code?: unknown } | null)?.code;
      if (isRefusalCode(code)) return [];
      throw e;
    }

    const logs = rows.map(toLog);
    return action ? logs.filter((l) => l.action === action) : logs;
  },

  update: async () => {
    throw new BrokerError("unsupported");
  },
};
