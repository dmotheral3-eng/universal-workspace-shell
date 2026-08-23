/**
 * /api/whereweare — the universal where-are-we ladder.
 *
 * WHAT THIS SURFACE IS, and the line it must not cross. It reports COUNTS AND
 * CLOCKS: how many work items sit in each named stage of a pipeline, when that
 * pipeline last actually moved, and how much of the addressable population has
 * been reached. It does NOT report owner names, account numbers, amounts, or any
 * row identity (twin precedent a3ec4fa3). Attestation crosses the tenant wall;
 * the rows themselves do not. Every field this handler emits is a number, a
 * timestamp, or a label that came out of the registry — there is no code path
 * here that can put a source row into a response.
 *
 * ORDER OF OPERATIONS IS THE SECURITY MODEL, same as the Cube broker:
 *
 *   method -> bearer present -> master verifies it
 *          -> registry read with the CALLER's own token (master RLS scopes it)
 *          -> per-ladder source read with a server-only credential
 *          -> counts and clocks assembled; nothing else can be assembled
 *
 * THE STALL CLOCK IS THE POINT, NOT DECORATION. A board that refreshes every 60s
 * over a pipeline that has not moved in 16 hours is lying by omission: it looks
 * alive because the CHROME is alive. `last_moved_at` is derived from the source's
 * own pulse log by finding the most recent sample where a SUBSTANTIVE metric value
 * actually changed, explicitly excluding pure age counters (keys beginning
 * `mins_since`) which tick upward forever and would make a dead pipeline read as
 * moving every single minute. A vertical with no pulse log gets NULL and is
 * rendered AMBER "no movement instrument" — never a fabricated timestamp.
 *
 * A number this handler cannot stand behind is NULL with a reason, never a guess.
 */

import { SOURCE_ROW_CEILING, PULSE_WINDOW, type WhereWeAreEnv } from "./env.js";

export type FetchLike = typeof fetch;

export interface WhereWeAreRequest {
  method: string;
  url: string;
  headers: { get(name: string): string | null };
}

export interface WhereWeAreResponse {
  status: number;
  body: unknown;
  headers: Record<string, string>;
}

export interface WhereWeAreDeps {
  env: WhereWeAreEnv;
  fetch: FetchLike;
  /** Server-side only. Codes, never values. */
  log?: (message: string) => void;
  /** Injected so tests are deterministic; production passes the real clock. */
  now?: () => number;
}

/** One registry row, exactly as public.whereweare_ladder stores it. */
export interface LadderRow {
  vertical: string;
  client_code: string | null;
  stage_seq: number;
  stage_key: string;
  stage_label: string;
  stage_hint: string | null;
  source_ref: string;
  source_view: string;
  stage_column: string;
  is_terminal: boolean;
  pulse_ref: string | null;
  pulse_table: string | null;
  denom_metric: string | null;
}

export interface StageOut {
  seq: number;
  key: string;
  label: string;
  hint: string | null;
  n: number | null;
  terminal: boolean;
}

export interface DenominatorOut {
  reached: number;
  of: number | null;
  label: string | null;
}

export interface LadderOut {
  vertical: string;
  client_code: string | null;
  stages: StageOut[];
  total: number | null;
  last_moved_at: string | null;
  stall_minutes: number | null;
  denominator: DenominatorOut | null;
  /** Null when everything resolved. Otherwise a machine code naming what is missing. */
  note: string | null;
  truncated: boolean;
}

export interface BoardOut {
  ladders: LadderOut[];
  /** In the vertical universe (v_whereweare_scope) but carrying no active ladder row. */
  unregistered: string[];
  checked_at: string;
}

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  // Operator state must never sit in a shared cache.
  "cache-control": "no-store",
};

function refuse(status: number, error: string): WhereWeAreResponse {
  return { status, body: { error }, headers: JSON_HEADERS };
}

export function bearerFrom(headers: { get(name: string): string | null }): string | null {
  const raw = headers.get("authorization") ?? headers.get("Authorization");
  if (!raw) return null;
  const m = /^Bearer\s+(.+)$/i.exec(raw.trim());
  if (!m) return null;
  const token = m[1].trim();
  return token === "" ? null : token;
}

/**
 * A locally decoded JWT is not verification — signature, expiry and revocation all
 * live upstream. Same rule the Cube broker follows; stated here rather than shared
 * so this route carries no dependency on the broker's own env shape.
 */
export async function verifySession(
  token: string,
  env: WhereWeAreEnv,
  fetchImpl: FetchLike
): Promise<{ id: string } | null> {
  let res: Response;
  try {
    res = await fetchImpl(`${env.masterUrl}/auth/v1/user`, {
      headers: { apikey: env.masterAnonKey, Authorization: `Bearer ${token}` },
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const json = (await res.json()) as { id?: unknown };
  return typeof json.id === "string" && json.id !== "" ? { id: json.id } : null;
}

/** `mineral` / `mineral::CW` — the grouping key for one ladder. */
export function ladderKey(vertical: string, clientCode: string | null): string {
  return clientCode ? `${vertical}::${clientCode}` : vertical;
}

/**
 * The whole reason this file exists. Walk pulse samples newest-first and return the
 * `taken_at` of the newest sample whose SUBSTANTIVE metrics differ from the sample
 * immediately older than it.
 *
 * Age counters are excluded by name (`mins_since*`). They change on every single
 * sample by construction, so including them would report a dead pipeline as having
 * moved seconds ago — which is precisely the failure this build was ordered to end.
 *
 * Returns null when there is no evidence of a change inside the window. Null is an
 * honest "not observed in the last N samples", and the caller renders it as such
 * rather than inventing a timestamp.
 */
export function lastMovedAt(samples: PulseSample[]): string | null {
  if (samples.length < 2) return null;

  const substantive = (s: PulseSample): string => {
    const metrics = Array.isArray(s.metrics) ? s.metrics : [];
    const pairs = metrics
      .filter((m) => typeof m?.k === "string" && !m.k.startsWith("mins_since"))
      .map((m) => `${m.k}=${JSON.stringify(m.n ?? null)}`)
      .sort();
    return pairs.join("|");
  };

  // samples arrive newest-first
  for (let i = 0; i < samples.length - 1; i++) {
    if (substantive(samples[i]) !== substantive(samples[i + 1])) {
      return samples[i].taken_at;
    }
  }
  return null;
}

export interface PulseMetric {
  k?: string;
  n?: number | null;
  s?: string | null;
  t?: string | null;
}

export interface PulseSample {
  taken_at: string;
  metrics: PulseMetric[];
}

/**
 * The denominator, e.g. "13 of 145 entities pulled". `n` is what has been reached;
 * the ceiling lives in the metric's own hint text (`t`), which is where the source
 * pipeline already writes it. Parsed, not assumed: if no integer can be read out of
 * the hint, `of` is null and the board shows a bare reached-count instead of
 * inventing a denominator.
 */
export function denominatorFrom(metric: PulseMetric | undefined): DenominatorOut | null {
  if (!metric || typeof metric.n !== "number") return null;
  const hint = typeof metric.t === "string" ? metric.t : null;
  const m = hint ? /(\d[\d,]*)/.exec(hint) : null;
  const of = m ? Number(m[1].replace(/,/g, "")) : null;
  return { reached: metric.n, of: Number.isFinite(of as number) ? (of as number) : null, label: hint };
}

async function getJson(
  fetchImpl: FetchLike,
  url: string,
  headers: Record<string, string>
): Promise<{ ok: true; rows: unknown[] } | { ok: false }> {
  try {
    const res = await fetchImpl(url, { headers });
    if (!res.ok) return { ok: false };
    const rows = await res.json();
    return Array.isArray(rows) ? { ok: true, rows } : { ok: false };
  } catch {
    return { ok: false };
  }
}

/** PostgREST identifiers come out of OUR registry, never out of a caller's query string. */
function safeIdent(value: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(value);
}

function safeRef(value: string): boolean {
  return /^[a-z0-9]{16,32}$/.test(value);
}

export async function handleWhereWeAreRequest(
  req: WhereWeAreRequest,
  deps: WhereWeAreDeps
): Promise<WhereWeAreResponse> {
  const { env, fetch: fetchImpl, log } = deps;
  const now = deps.now ?? (() => Date.now());

  if (req.method !== "GET") return refuse(405, "method_not_allowed");

  const token = bearerFrom(req.headers);
  if (!token) return refuse(401, "not_authenticated");

  const user = await verifySession(token, env, fetchImpl);
  if (!user) return refuse(401, "not_authenticated");

  // The registry is read with the CALLER's token, so master's RLS does the scoping
  // and this route holds no master secret of its own.
  const callerHeaders = { apikey: env.masterAnonKey, Authorization: `Bearer ${token}` };

  const registry = await getJson(
    fetchImpl,
    `${env.masterUrl}/rest/v1/whereweare_ladder` +
      `?active=eq.true&select=vertical,client_code,stage_seq,stage_key,stage_label,stage_hint,` +
      `source_ref,source_view,stage_column,is_terminal,pulse_ref,pulse_table,denom_metric` +
      `&order=vertical.asc,client_code.asc,stage_seq.asc`,
    callerHeaders
  );
  if (!registry.ok) {
    log?.("registry_unreadable");
    return refuse(502, "registry_unreadable");
  }

  const scope = await getJson(
    fetchImpl,
    `${env.masterUrl}/rest/v1/v_whereweare_scope?select=vertical&order=vertical.asc`,
    callerHeaders
  );

  const rows = registry.rows as LadderRow[];
  const grouped = new Map<string, LadderRow[]>();
  for (const row of rows) {
    const key = ladderKey(row.vertical, row.client_code);
    const bucket = grouped.get(key);
    if (bucket) bucket.push(row);
    else grouped.set(key, [row]);
  }

  const ladders: LadderOut[] = [];
  for (const bucket of grouped.values()) {
    ladders.push(await buildLadder(bucket, env, fetchImpl, now));
  }

  const registered = new Set(rows.map((r) => r.vertical));
  const unregistered = scope.ok
    ? (scope.rows as { vertical: string }[])
        .map((r) => r.vertical)
        .filter((v) => !registered.has(v))
    : [];

  const body: BoardOut = {
    ladders,
    unregistered,
    checked_at: new Date(now()).toISOString(),
  };
  return { status: 200, body, headers: JSON_HEADERS };
}

async function buildLadder(
  bucket: LadderRow[],
  env: WhereWeAreEnv,
  fetchImpl: FetchLike,
  now: () => number
): Promise<LadderOut> {
  const head = bucket[0];
  const stages: StageOut[] = bucket.map((r) => ({
    seq: r.stage_seq,
    key: r.stage_key,
    label: r.stage_label,
    hint: r.stage_hint,
    n: null,
    terminal: r.is_terminal,
  }));

  const base: LadderOut = {
    vertical: head.vertical,
    client_code: head.client_code,
    stages,
    total: null,
    last_moved_at: null,
    stall_minutes: null,
    denominator: null,
    note: null,
    truncated: false,
  };

  const sourceKey = env.sourceKeys[head.source_ref];
  if (!sourceKey) return { ...base, note: "no_source_credential" };
  if (!safeRef(head.source_ref) || !safeIdent(head.source_view) || !safeIdent(head.stage_column)) {
    return { ...base, note: "registry_row_malformed" };
  }

  const sourceUrl = `https://${head.source_ref}.supabase.co`;
  const counted = await getJson(
    fetchImpl,
    `${sourceUrl}/rest/v1/${head.source_view}?select=${head.stage_column}&limit=${SOURCE_ROW_CEILING}`,
    { apikey: sourceKey, Authorization: `Bearer ${sourceKey}` }
  );
  if (!counted.ok) return { ...base, note: "source_unreadable" };

  const tally = new Map<string, number>();
  for (const row of counted.rows as Record<string, unknown>[]) {
    const value = row?.[head.stage_column];
    const key = typeof value === "string" ? value : "";
    tally.set(key, (tally.get(key) ?? 0) + 1);
  }

  const withCounts = stages.map((s) => ({ ...s, n: tally.get(s.key) ?? 0 }));
  const total = counted.rows.length;
  // A ceiling hit means the tally is a floor, not a count. Say so rather than
  // presenting a truncated number as if it were the whole population.
  const truncated = total >= SOURCE_ROW_CEILING;

  let lastMoved: string | null = null;
  let stallMinutes: number | null = null;
  let denominator: DenominatorOut | null = null;
  let note: string | null = null;

  if (head.pulse_ref && head.pulse_table) {
    if (!safeRef(head.pulse_ref) || !safeIdent(head.pulse_table)) {
      note = "registry_row_malformed";
    } else {
      const pulseKey = env.sourceKeys[head.pulse_ref];
      if (!pulseKey) {
        note = "no_pulse_credential";
      } else {
        const pulse = await getJson(
          fetchImpl,
          `https://${head.pulse_ref}.supabase.co/rest/v1/${head.pulse_table}` +
            `?select=taken_at,metrics&order=taken_at.desc&limit=${PULSE_WINDOW}`,
          { apikey: pulseKey, Authorization: `Bearer ${pulseKey}` }
        );
        if (!pulse.ok) {
          note = "pulse_unreadable";
        } else {
          const samples = pulse.rows as PulseSample[];
          lastMoved = lastMovedAt(samples);
          if (lastMoved) {
            stallMinutes = Math.max(0, Math.round((now() - Date.parse(lastMoved)) / 60000));
          }
          if (head.denom_metric) {
            const newest = samples[0];
            const metric = Array.isArray(newest?.metrics)
              ? newest.metrics.find((m) => m?.k === head.denom_metric)
              : undefined;
            denominator = denominatorFrom(metric);
          }
        }
      }
    }
  } else {
    // No instrument at all is a DIFFERENT state from "instrument present, nothing
    // moved". The board renders this AMBER and says which one it is.
    note = "no_movement_instrument";
  }

  return {
    ...base,
    stages: withCounts,
    total,
    truncated,
    last_moved_at: lastMoved,
    stall_minutes: stallMinutes,
    denominator,
    note,
  };
}
