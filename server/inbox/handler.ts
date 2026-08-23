/**
 * /api/inbox — Dave's operator inbox: one read, four panels, every number sourced.
 *
 * WHAT THIS SURFACE IS. It is a READER. There is no code path in this file that
 * writes, fires, claims, closes or mutates anything — v1 is deliberately
 * read-only, so the worst a bug here can do is show the wrong number, never move
 * somebody's work.
 *
 * ORDER OF OPERATIONS IS THE SECURITY MODEL, same as the Cube broker and the
 * where-are-we ladder:
 *
 *   method -> bearer present -> master verifies it
 *          -> every source read with the CALLER'S OWN token (master RLS scopes it)
 *          -> per-source provenance attached; nothing else can be attached
 *
 * EVERY PANEL CARRIES ITS SOURCE AND ITS CLOCK. Each section returns
 * { source, rows, read_at, truncated, error } and the UI prints the source view
 * name under the panel. A panel that cannot read its source renders its error by
 * name — a blank panel and a broken panel must never look the same, which is the
 * failure the where-are-we board was written against.
 *
 * THE QUEUE READ IS NOT THE QUEUE TABLE, AND THE REASON MATTERS.
 * public.code_dispatch_queue grants SELECT to neither `authenticated` nor `anon`
 * — the grant is absent before RLS is even consulted — so a caller-token read of
 * it returns nothing for everyone, including Dave. Reading it would have required
 * arming this route with a master service key, which is a much larger permission
 * than this panel needs.
 *
 * Instead the queue panel reads public.v_dispatch_program, a definer view that IS
 * granted to `authenticated` and carries exactly what a board needs: id, status,
 * surface, lane, title, created_at, program_key. What it does NOT carry is the
 * prompt, the stations and the result — so the detail pane shows what exists and
 * NAMES what it cannot reach and why, rather than rendering an empty box that
 * reads as "this dispatch has no prompt".
 */

import { ROW_CEILING, type InboxEnv } from "./env.js";

export type FetchLike = typeof fetch;

export interface InboxRequest {
  method: string;
  url: string;
  headers: { get(name: string): string | null };
}

export interface InboxResponse {
  status: number;
  body: unknown;
  headers: Record<string, string>;
}

export interface InboxDeps {
  env: InboxEnv;
  fetch: FetchLike;
  /** Server-side only. Codes, never values. */
  log?: (message: string) => void;
  now?: () => number;
}

/** One panel's worth of data, with everything needed to say where it came from. */
export interface Section<T> {
  /** The exact relation this came from. Printed under the panel. */
  source: string;
  rows: T[];
  read_at: string;
  /** True when the ceiling cut the read short. The panel says so. */
  truncated: boolean;
  /** Set when the read failed. rows is then empty and the panel renders THIS, not emptiness. */
  error: string | null;
  /** Set when the source is reachable but deliberately incomplete. Rendered as a note. */
  caveat?: string;
}

export interface QueueRow {
  id: string;
  status: string | null;
  surface: string | null;
  lane: string | null;
  title: string | null;
  created_at: string | null;
  program_key: string | null;
  /** From v_blockers, joined in this handler — present only for blocked rows. */
  blocks_what?: string | null;
}

export interface InboxRow {
  kind: "parked" | "open_item";
  title: string;
  detail: string | null;
  lane: string | null;
  at: string | null;
  age_hours: number | null;
}

export interface TodoRow {
  lane: string | null;
  source: string | null;
  title: string | null;
  status: string | null;
  bucket: string | null;
  ref_url: string | null;
  age_hours: number | null;
}

export interface LaneHealth {
  lane_status: string | null;
  headline: string | null;
  queued_n: number | null;
  running_n: number | null;
  stuck_fired_n: number | null;
  stuck_running_n: number | null;
  oldest_queued_hours: number | null;
  checked_at: string | null;
}

export interface InboxBoard {
  queue: Section<QueueRow>;
  inbox: Section<InboxRow>;
  todo: Section<TodoRow>;
  health: Section<LaneHealth>;
  checked_at: string;
}

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

export async function handleInboxRequest(
  req: InboxRequest,
  deps: InboxDeps,
): Promise<InboxResponse> {
  const now = deps.now ?? Date.now;

  if (req.method !== "GET") {
    return { status: 405, body: { error: "method_not_allowed" }, headers: JSON_HEADERS };
  }

  const token = bearer(req.headers.get("authorization"));
  if (!token) {
    return { status: 401, body: { error: "not_authenticated" }, headers: JSON_HEADERS };
  }

  // The token is verified UPSTREAM, by master, not decoded here. A locally
  // decoded JWT is not verification — signature, expiry and revocation all live
  // at the issuer.
  const user = await verifyMasterSession(token, deps);
  if (!user) {
    return { status: 401, body: { error: "not_authenticated" }, headers: JSON_HEADERS };
  }

  const readAt = new Date(now()).toISOString();

  const [queue, blockers, courier, openItems, todo, health] = await Promise.all([
    read<Record<string, unknown>>(
      "v_dispatch_program",
      "select=id,status,surface,lane,title,created_at,program_key&status=not.in.(done,canceled)&order=created_at.desc",
      token, deps,
    ),
    read<Record<string, unknown>>("v_blockers", "select=id,blocks_what", token, deps),
    read<Record<string, unknown>>(
      "v_artifact_current",
      "select=artifact_key,source_code,created_at&artifact_key=eq.lane-inbox-courier",
      token, deps,
    ),
    read<Record<string, unknown>>(
      "open_items",
      "select=id,title,detail,lane,status,created_at&status=eq.open&order=created_at.desc",
      token, deps,
    ),
    read<Record<string, unknown>>(
      "v_motherdesk_master_todo",
      "select=lane,source,title,status,bucket,ref_url,age_hours&order=age_hours.desc",
      token, deps,
    ),
    read<Record<string, unknown>>("v_dispatch_lane_health", "select=*", token, deps),
  ]);

  return {
    status: 200,
    body: {
      queue: queueSection(queue, blockers, readAt),
      inbox: inboxSection(courier, openItems, readAt),
      todo: section("v_motherdesk_master_todo", todo, readAt, toTodo),
      health: section("v_dispatch_lane_health", health, readAt, toHealth),
      checked_at: readAt,
    } satisfies InboxBoard,
    headers: JSON_HEADERS,
  };
}

// ---------------------------------------------------------------------------

function bearer(header: string | null): string | null {
  if (!header) return null;
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  return m ? m[1].trim() : null;
}

interface ReadResult<T> {
  rows: T[];
  error: string | null;
  truncated: boolean;
}

/**
 * One PostgREST read with the caller's own token.
 *
 * A failure is CAPTURED, not thrown: one unreadable source must not blank the
 * other three panels. The code travels to the UI so the panel can say which
 * source failed and how.
 */
async function read<T>(
  relation: string,
  query: string,
  token: string,
  deps: InboxDeps,
): Promise<ReadResult<T>> {
  const url = `${deps.env.masterUrl}/rest/v1/${relation}?${query}&limit=${ROW_CEILING + 1}`;
  try {
    const res = await deps.fetch(url, {
      headers: {
        apikey: deps.env.masterAnonKey,
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });
    if (!res.ok) {
      deps.log?.(`${relation} read failed http_${res.status}`);
      return { rows: [], error: `http_${res.status}`, truncated: false };
    }
    const json = (await res.json().catch(() => null)) as unknown;
    if (!Array.isArray(json)) {
      deps.log?.(`${relation} returned a non-array`);
      return { rows: [], error: "unexpected_shape", truncated: false };
    }
    const truncated = json.length > ROW_CEILING;
    return { rows: (truncated ? json.slice(0, ROW_CEILING) : json) as T[], error: null, truncated };
  } catch {
    deps.log?.(`${relation} unreachable`);
    return { rows: [], error: "unreachable", truncated: false };
  }
}

async function verifyMasterSession(
  token: string,
  deps: InboxDeps,
): Promise<{ id: string } | null> {
  try {
    const res = await deps.fetch(`${deps.env.masterUrl}/auth/v1/user`, {
      headers: { apikey: deps.env.masterAnonKey, Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { id?: unknown };
    return typeof json.id === "string" && json.id !== "" ? { id: json.id } : null;
  } catch {
    return null;
  }
}

const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** The generic section wrapper: rows mapped, provenance attached, failure preserved. */
function section<T>(
  source: string,
  result: ReadResult<Record<string, unknown>>,
  readAt: string,
  map: (row: Record<string, unknown>) => T,
): Section<T> {
  return {
    source,
    rows: result.rows.map(map),
    read_at: readAt,
    truncated: result.truncated,
    error: result.error,
  };
}

function queueSection(
  queue: ReadResult<Record<string, unknown>>,
  blockers: ReadResult<Record<string, unknown>>,
  readAt: string,
): Section<QueueRow> {
  // The blocker reason is a second read rather than a join, because the two
  // views are separate relations. A failed blocker read costs the reasons, not
  // the board.
  const reasons = new Map<string, string | null>();
  for (const b of blockers.rows) {
    const id = str(b.id);
    if (id) reasons.set(id, str(b.blocks_what));
  }

  const rows: QueueRow[] = queue.rows.map((r) => {
    const id = str(r.id) ?? "";
    return {
      id,
      status: str(r.status),
      surface: str(r.surface),
      lane: str(r.lane),
      title: str(r.title),
      created_at: str(r.created_at),
      program_key: str(r.program_key),
      blocks_what: reasons.get(id) ?? null,
    };
  });

  return {
    source: "v_dispatch_program (+ v_blockers for reasons)",
    rows,
    read_at: readAt,
    truncated: queue.truncated,
    error: queue.error,
    // Stated on the panel, every time. The absent fields are absent for a
    // permission reason, not because the dispatches have no prompts.
    caveat:
      "prompt, stations and result are not on this view; public.code_dispatch_queue grants SELECT to neither authenticated nor anon, so a caller-token read cannot reach them" +
      (blockers.error ? ` · blocker reasons unavailable (${blockers.error})` : ""),
  };
}

/**
 * The inbox is TWO streams merged, newest first: the cron-refreshed courier feed
 * of parked work, and the open items filed against lanes.
 *
 * The courier artifact is JSON in a text column, so a malformed body is possible
 * and is handled as a named error rather than an exception — the open items still
 * render.
 */
function inboxSection(
  courier: ReadResult<Record<string, unknown>>,
  openItems: ReadResult<Record<string, unknown>>,
  readAt: string,
): Section<InboxRow> {
  const rows: InboxRow[] = [];
  let courierError = courier.error;

  const body = courier.rows[0]?.source_code;
  if (typeof body === "string" && body !== "") {
    try {
      const parsed = JSON.parse(body) as { rows?: unknown };
      const feed = Array.isArray(parsed.rows) ? parsed.rows : [];
      for (const raw of feed) {
        if (!raw || typeof raw !== "object") continue;
        const r = raw as Record<string, unknown>;
        rows.push({
          kind: "parked",
          title: str(r.item) ?? "(unnamed parked item)",
          detail: null,
          lane: str(r.lane),
          at: str(r.parked_at),
          age_hours: num(r.age_hours),
        });
      }
    } catch {
      courierError = courierError ?? "courier_feed_unparseable";
    }
  } else if (!courierError && courier.rows.length === 0) {
    courierError = "courier_feed_missing";
  }

  for (const r of openItems.rows) {
    rows.push({
      kind: "open_item",
      title: str(r.title) ?? "(untitled item)",
      detail: str(r.detail),
      lane: str(r.lane),
      at: str(r.created_at),
      age_hours: null,
    });
  }

  // Newest first across both streams; an item with no timestamp sorts last
  // rather than being dropped.
  rows.sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));

  const errors = [courierError, openItems.error].filter(Boolean);

  return {
    source: "v_artifact_current[lane-inbox-courier] + open_items(status=open)",
    rows,
    read_at: readAt,
    truncated: courier.truncated || openItems.truncated,
    error: errors.length ? errors.join(" · ") : null,
  };
}

function toTodo(r: Record<string, unknown>): TodoRow {
  return {
    lane: str(r.lane),
    source: str(r.source),
    title: str(r.title),
    status: str(r.status),
    bucket: str(r.bucket),
    ref_url: str(r.ref_url),
    age_hours: num(r.age_hours),
  };
}

function toHealth(r: Record<string, unknown>): LaneHealth {
  return {
    lane_status: str(r.lane_status),
    headline: str(r.headline),
    queued_n: num(r.queued_n),
    running_n: num(r.running_n),
    stuck_fired_n: num(r.stuck_fired_n),
    stuck_running_n: num(r.stuck_running_n),
    oldest_queued_hours: num(r.oldest_queued_hours),
    checked_at: str(r.checked_at),
  };
}
