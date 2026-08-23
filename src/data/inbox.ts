/**
 * Client half of the operator inbox.
 *
 * Knows nothing that matters: no project ref, no key, no view name. It sends the
 * user's MASTER session to a same-origin path and gets back four sections, each
 * carrying its own source and read clock. Every decision that could be abused —
 * which project, which relation, which credential — is made in server/inbox/,
 * where the browser cannot reach it. Same shape as src/data/whereweare.ts and
 * src/data/cube-broker.ts, deliberately.
 *
 * LIVE BY DEFAULT: there is no fixture path in this file and there must never be
 * one. A hardcoded row on an inbox is a photograph of somebody's work, and a
 * photograph is exactly what an inbox must not be.
 */

import { getAccessToken } from "./lawdog-auth";

export interface Section<T> {
  source: string;
  rows: T[];
  read_at: string;
  truncated: boolean;
  error: string | null;
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

export class InboxError extends Error {
  code: string;
  constructor(code: string) {
    super(code);
    this.name = "InboxError";
    this.code = code;
  }
}

export async function loadInbox(): Promise<InboxBoard> {
  // Signed out is refused at the server too. This is a courtesy so a signed-out
  // panel does not fire a request that can only 401.
  const token = await getAccessToken();
  if (!token) throw new InboxError("not_authenticated");

  const res = await fetch("/api/inbox", { headers: { Authorization: `Bearer ${token}` } });
  const json = (await res.json().catch(() => null)) as InboxBoard | { error?: string } | null;

  if (!res.ok) {
    const code = json && "error" in json && json.error ? json.error : `http_${res.status}`;
    throw new InboxError(String(code));
  }
  if (!json || !("queue" in json)) throw new InboxError("unexpected_shape");
  return json;
}

/** "3h" / "2d" / "just now" — an age a person reads without doing arithmetic. */
export function humanAge(iso: string | null, hours?: number | null): string {
  const h =
    typeof hours === "number" && Number.isFinite(hours)
      ? hours
      : iso
        ? (Date.now() - new Date(iso).getTime()) / 3_600_000
        : null;
  if (h === null || !Number.isFinite(h)) return "—";
  if (h < 1) return "just now";
  if (h < 48) return `${Math.round(h)}h`;
  return `${Math.round(h / 24)}d`;
}

export type Light = "green" | "amber" | "red";

/**
 * The lane light, taken from the view's OWN verdict rather than recomputed here.
 * v_dispatch_lane_health already decides GREEN/AMBER/RED using things this client
 * cannot see (whether a cron job exists, what HTTP status the last fire got);
 * second-guessing it in the browser would produce a light that disagrees with the
 * one every other surface shows.
 */
export function lightOf(status: string | null): Light {
  const s = (status ?? "").toUpperCase();
  if (s.includes("RED")) return "red";
  if (s.includes("AMBER")) return "amber";
  if (s.includes("GREEN")) return "green";
  return "amber";
}
