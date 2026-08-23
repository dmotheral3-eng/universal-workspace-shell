/**
 * Client half of the where-are-we ladder.
 *
 * Knows nothing that matters: no project ref, no key, no view name, no stage
 * vocabulary. It sends the user's MASTER session to a same-origin path and gets
 * counts and clocks back. Every decision that could be abused — which project,
 * which view, which credential — is made in server/whereweare/, where the browser
 * cannot reach it. Same shape as src/data/cube-broker.ts, deliberately.
 *
 * LIVE BY DEFAULT (twin precedent 35aaa1a2): there is no fixture path in this
 * file and there must never be one. A hardcoded number on this board is a
 * photograph, and a photograph is the exact failure the board exists to end.
 */

import { getAccessToken } from "./lawdog-auth";

export interface WhereWeAreStage {
  seq: number;
  key: string;
  label: string;
  hint: string | null;
  n: number | null;
  terminal: boolean;
}

export interface WhereWeAreDenominator {
  reached: number;
  of: number | null;
  label: string | null;
}

export interface WhereWeAreLadder {
  vertical: string;
  client_code: string | null;
  stages: WhereWeAreStage[];
  total: number | null;
  last_moved_at: string | null;
  stall_minutes: number | null;
  denominator: WhereWeAreDenominator | null;
  note: string | null;
  truncated: boolean;
}

export interface WhereWeAreBoard {
  ladders: WhereWeAreLadder[];
  unregistered: string[];
  checked_at: string;
}

export class WhereWeAreError extends Error {
  code: string;
  constructor(code: string) {
    super(code);
    this.name = "WhereWeAreError";
    this.code = code;
  }
}

export async function loadWhereWeAre(): Promise<WhereWeAreBoard> {
  // Signed out is refused at the server too. This is a courtesy so a signed-out
  // panel does not fire a request that can only 401.
  const token = await getAccessToken();
  if (!token) throw new WhereWeAreError("not_authenticated");

  const res = await fetch("/api/whereweare", { headers: { Authorization: `Bearer ${token}` } });
  const json = (await res.json().catch(() => null)) as WhereWeAreBoard | { error?: string } | null;

  if (!res.ok) {
    const code = json && "error" in json && json.error ? json.error : `http_${res.status}`;
    throw new WhereWeAreError(String(code));
  }
  if (!json || !("ladders" in json) || !Array.isArray(json.ladders)) {
    throw new WhereWeAreError("bad_payload");
  }
  return json;
}

/** GREEN under 4h, AMBER 4-24h, RED over 24h or unknown. Unknown is never green. */
export type StallLight = "green" | "amber" | "red";

export function stallLight(stallMinutes: number | null): StallLight {
  if (stallMinutes === null) return "red";
  if (stallMinutes < 4 * 60) return "green";
  if (stallMinutes <= 24 * 60) return "amber";
  return "red";
}

/** "16h 36m ago" / "3d 2h ago". Never "just now" for an unknown. */
export function humanAge(stallMinutes: number | null): string {
  if (stallMinutes === null) return "never observed moving";
  if (stallMinutes < 1) return "moving now";
  if (stallMinutes < 60) return `${stallMinutes}m ago`;
  const hours = Math.floor(stallMinutes / 60);
  const mins = stallMinutes % 60;
  if (hours < 24) return `${hours}h ${mins}m ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h ago`;
}

/** Machine codes are for logs; this is what a person reads. */
export function noteLine(note: string | null): string | null {
  switch (note) {
    case null:
      return null;
    case "no_source_credential":
      return "No read credential is configured for this vertical's source project, so its counts cannot be read.";
    case "no_pulse_credential":
      return "No read credential is configured for this vertical's movement log.";
    case "source_unreadable":
      return "The source view did not answer. Counts below are unavailable, not zero.";
    case "pulse_unreadable":
      return "The movement log did not answer, so the stall clock is unknown.";
    case "no_movement_instrument":
      return "No movement instrument is registered for this vertical, so nothing can say when it last moved.";
    case "registry_row_malformed":
      return "This ladder's registry row names something that is not a valid identifier and was refused.";
    default:
      return note;
  }
}
