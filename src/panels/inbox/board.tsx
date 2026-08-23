/**
 * The operator inbox — one fetch, four panels, every number sourced.
 *
 * ONE READ FOR THE WHOLE BOARD. The four panels share a single /api/inbox call
 * rather than fetching independently, so they can never disagree about what time
 * it is — a queue count from 22:04 sitting beside a health light from 22:09 is
 * two boards pretending to be one.
 *
 * READ-ONLY, DELIBERATELY. v1 has no control that mutates a row. The queue is
 * where real work is claimed and closed by seats holding session keys and
 * traveler cards; a stray click here must not be able to take a row out from
 * under one of them. Adding actions later means adding the gates that go with
 * them, and that is its own dispatch.
 */

import { useCallback, useEffect, useState } from "react";
import {
  humanAge,
  lightOf,
  loadInbox,
  type InboxBoard,
  type QueueRow,
} from "@/data/inbox";
import { LIGHT, PanelFrame, Pill, SectionBody } from "./shared";

const REFRESH_MS = 60_000;

export function InboxBoardPanel() {
  const [board, setBoard] = useState<InboxBoard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<QueueRow | null>(null);

  const load = useCallback(async () => {
    try {
      setBoard(await loadInbox());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "load_failed");
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  if (error) {
    return (
      <div className="p-4 text-xs text-destructive">
        The inbox could not load: <span className="font-mono">{error}</span>
      </div>
    );
  }
  if (!board) return <div className="p-4 text-xs text-muted-foreground">Loading…</div>;

  const health = board.health.rows[0] ?? null;
  const light = lightOf(health?.lane_status ?? null);
  const c = LIGHT[light];

  // Lanes ordered by how much is waiting, so the busiest lane is not buried
  // under an alphabet.
  const byLane = new Map<string, QueueRow[]>();
  for (const r of board.queue.rows) {
    const lane = r.lane ?? "(no lane)";
    const list = byLane.get(lane) ?? [];
    list.push(r);
    byLane.set(lane, list);
  }
  const lanes = [...byLane.entries()].sort((a, b) => b[1].length - a[1].length);

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* HEALTH STRIP — persistent, and it states the headline verbatim rather
          than summarising it. RED reads first, the same way a hard stop does. */}
      <div
        className="rounded-lg border px-4 py-3"
        style={{ background: c.bg, borderColor: c.border, color: c.fg }}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.dot }} />
          <span className="text-sm font-semibold">{health?.lane_status ?? "LANE STATUS UNKNOWN"}</span>
          {health && (
            <span className="text-[11px]">
              {health.queued_n ?? 0} queued · {health.running_n ?? 0} running
              {health.stuck_fired_n ? ` · ${health.stuck_fired_n} stuck fired` : ""}
              {health.stuck_running_n ? ` · ${health.stuck_running_n} stuck running` : ""}
            </span>
          )}
        </div>
        <p className="mt-1.5 text-xs leading-snug">
          {board.health.error
            ? `Could not read the lane light: ${board.health.error}`
            : (health?.headline ?? "No headline returned.")}
        </p>
        <p className="mt-1 text-[10px] opacity-80">
          <span className="font-mono">{board.health.source}</span> · read{" "}
          {new Date(board.health.read_at).toLocaleTimeString()}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* QUEUE */}
        <PanelFrame title="Queue" count={board.queue.rows.length} section={board.queue}>
          <SectionBody section={board.queue} empty="Nothing open on the rail.">
            <div className="flex flex-col gap-3">
              {lanes.map(([lane, rows]) => (
                <div key={lane}>
                  <div className="mb-1 flex items-baseline gap-2">
                    <span className="text-xs font-semibold">{lane}</span>
                    <span className="text-[11px] text-muted-foreground">{rows.length}</span>
                  </div>
                  <ul className="flex flex-col gap-1">
                    {rows.map((r) => (
                      <li key={r.id}>
                        <button
                          type="button"
                          onClick={() => setSelected(r)}
                          className="flex w-full items-baseline gap-2 rounded px-1.5 py-1 text-left hover:bg-accent"
                        >
                          <Pill>{r.status ?? "?"}</Pill>
                          <span className="min-w-0 flex-1 truncate text-xs">
                            {r.title ?? "(untitled)"}
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            {humanAge(r.created_at)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </SectionBody>
        </PanelFrame>

        {/* INBOX */}
        <PanelFrame title="Inbox" count={board.inbox.rows.length} section={board.inbox}>
          <SectionBody section={board.inbox} empty="Nothing parked and nothing filed open.">
            <ul className="flex flex-col gap-1.5">
              {board.inbox.rows.map((r, i) => (
                <li key={`${r.kind}-${i}`} className="flex items-baseline gap-2">
                  <Pill>{r.kind === "parked" ? "parked" : "open"}</Pill>
                  <span className="min-w-0 flex-1 text-xs">
                    {r.title}
                    {r.lane && (
                      <span className="ml-1.5 text-[11px] text-muted-foreground">{r.lane}</span>
                    )}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {humanAge(r.at, r.age_hours)}
                  </span>
                </li>
              ))}
            </ul>
          </SectionBody>
        </PanelFrame>

        {/* TODO */}
        <PanelFrame title="Master todo" count={board.todo.rows.length} section={board.todo}>
          <SectionBody section={board.todo} empty="The master todo is clear.">
            <ul className="flex flex-col gap-1.5">
              {board.todo.rows.map((r, i) => (
                <li key={i} className="flex items-baseline gap-2">
                  <Pill>{r.bucket ?? r.status ?? "?"}</Pill>
                  <span className="min-w-0 flex-1 truncate text-xs">
                    {r.title ?? "(untitled)"}
                    {r.lane && (
                      <span className="ml-1.5 text-[11px] text-muted-foreground">{r.lane}</span>
                    )}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {humanAge(null, r.age_hours)}
                  </span>
                </li>
              ))}
            </ul>
          </SectionBody>
        </PanelFrame>

        {/* DETAIL — what the board can actually show about one row, and an
            explicit note about what it cannot. */}
        <section className="rounded-lg border border-border bg-card">
          <header className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold">Detail</h2>
          </header>
          <div className="px-4 py-3">
            {!selected ? (
              <p className="text-xs text-muted-foreground">Pick a row in the queue.</p>
            ) : (
              <div className="flex flex-col gap-2 text-xs">
                <div className="font-semibold">{selected.title ?? "(untitled)"}</div>
                <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-1">
                  <dt className="text-muted-foreground">status</dt>
                  <dd>{selected.status ?? "—"}</dd>
                  <dt className="text-muted-foreground">lane</dt>
                  <dd>{selected.lane ?? "—"}</dd>
                  <dt className="text-muted-foreground">surface</dt>
                  <dd>{selected.surface ?? "—"}</dd>
                  <dt className="text-muted-foreground">program</dt>
                  <dd>{selected.program_key ?? "—"}</dd>
                  <dt className="text-muted-foreground">age</dt>
                  <dd>{humanAge(selected.created_at)}</dd>
                  <dt className="text-muted-foreground">id</dt>
                  <dd className="font-mono text-[10px] break-all">{selected.id}</dd>
                </dl>
                {selected.blocks_what && (
                  <div>
                    <div className="text-muted-foreground">blocked on</div>
                    <p className="mt-0.5 leading-snug">{selected.blocks_what}</p>
                  </div>
                )}
                <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
                  The prompt, stations and result are not on this board. They live on a
                  relation this reader cannot reach with your own session, so showing an
                  empty box for them would read as &ldquo;this dispatch has none&rdquo; —
                  which is not true.
                </p>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
