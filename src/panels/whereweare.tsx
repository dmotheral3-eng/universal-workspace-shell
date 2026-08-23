/**
 * WhereWeAre — the universal where-are-we ladder.
 *
 * ONE of these covers every vertical. The stage names, their order, their source
 * and their movement instrument all come from public.whereweare_ladder on master;
 * nothing about CW Mineral (or any other client) is written into this file.
 * Registering a new vertical is an INSERT, and this component renders it without
 * being edited.
 *
 * THREE THINGS EVERY LADDER SHOWS, and the third is the one that was missing:
 *   1. the stage columns with live counts
 *   2. the denominator, where the source publishes one
 *   3. the STALL CLOCK — when this pipeline last actually moved, with a
 *      GREEN/AMBER/RED light. A count with no last-changed timestamp is the
 *      defect this panel exists to end: the board looked alive at a 60s refresh
 *      while nothing had moved for 16.6 hours.
 *
 * A vertical in scope with no ladder registered renders RED and names itself, so a
 * missing capability is discovered by seeing it rather than by Dave asking for it.
 */

import { useCallback, useEffect, useState } from "react";
import {
  humanAge,
  loadWhereWeAre,
  noteLine,
  stallLight,
  type WhereWeAreBoard,
  type WhereWeAreLadder,
  type StallLight,
} from "@/data/whereweare";

const LIGHT: Record<StallLight, { dot: string; bg: string; fg: string; border: string }> = {
  green: { dot: "#3f8f5f", bg: "#eef5f0", fg: "#2c6644", border: "#cfe3d6" },
  amber: { dot: "#b08034", bg: "#f8f2e6", fg: "#7a5a1e", border: "#e8dcc2" },
  red: { dot: "#b4342a", bg: "#f9ece9", fg: "#8a2b22", border: "#eccfc9" },
};

function Light({ light, children }: { light: StallLight; children: React.ReactNode }) {
  const c = LIGHT[light];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{ background: c.bg, color: c.fg, border: `1px solid ${c.border}` }}
    >
      <span className="h-2 w-2 rounded-full" style={{ background: c.dot }} />
      {children}
    </span>
  );
}

function Ladder({ ladder }: { ladder: WhereWeAreLadder }) {
  const light = stallLight(ladder.stall_minutes);
  const note = noteLine(ladder.note);
  const title = ladder.client_code ? `${ladder.client_code} ${ladder.vertical}` : ladder.vertical;
  const denom = ladder.denominator;

  return (
    <section className="rounded-lg border border-border bg-card">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide">{title}</h3>

        {/* (a) last_moved_at as human age, and (b) the stall light. */}
        <Light light={light}>{humanAge(ladder.stall_minutes)}</Light>

        {/* (c) the denominator, where one exists. */}
        {denom && (
          <span className="text-xs text-muted-foreground">
            {denom.reached}
            {denom.of !== null ? ` of ${denom.of}` : ""} entities pulled
          </span>
        )}

        {ladder.total !== null && (
          <span className="ml-auto text-xs text-muted-foreground">
            {ladder.total} in flight{ladder.truncated ? " (at read ceiling — this is a floor)" : ""}
          </span>
        )}
      </header>

      {note && (
        <p
          className="border-b border-border px-4 py-2 text-xs"
          style={{ background: LIGHT.amber.bg, color: LIGHT.amber.fg }}
        >
          {note}
        </p>
      )}

      <ol className="flex flex-wrap gap-2 p-4">
        {ladder.stages.map((stage) => (
          <li
            key={stage.seq}
            className="min-w-[8.5rem] flex-1 rounded-md border border-border px-3 py-2"
            style={stage.terminal ? { borderColor: LIGHT.green.border, background: LIGHT.green.bg } : undefined}
          >
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {stage.seq}. {stage.label}
            </div>
            <div className="text-2xl font-semibold tabular-nums">
              {/* Unavailable is not zero, and must never look like zero. */}
              {stage.n === null ? <span className="text-muted-foreground">--</span> : stage.n}
            </div>
            {stage.hint && <div className="mt-0.5 text-[10px] text-muted-foreground">{stage.hint}</div>}
          </li>
        ))}
      </ol>
    </section>
  );
}

function Unregistered({ vertical }: { vertical: string }) {
  return (
    <section
      className="rounded-lg border px-4 py-3"
      style={{ background: LIGHT.red.bg, borderColor: LIGHT.red.border }}
    >
      <div className="flex items-center gap-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide" style={{ color: LIGHT.red.fg }}>
          {vertical}
        </h3>
        <Light light="red">no ladder registered</Light>
      </div>
      <p className="mt-1 text-xs" style={{ color: LIGHT.red.fg }}>
        This vertical has no stages in whereweare_ladder, so nothing can say where its work is.
        Registering it is an INSERT, not a code change.
      </p>
    </section>
  );
}

export function WhereWeArePanel() {
  const [board, setBoard] = useState<WhereWeAreBoard | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setBoard(await loadWhereWeAre());
      setError(null);
    } catch (e) {
      // A stale board is worse than an honest error: keep the last good numbers
      // but say plainly that they are no longer confirmed.
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 60_000);
    return () => clearInterval(timer);
  }, [load]);

  return (
    <div className="h-full overflow-auto p-4">
      <div className="mb-4">
        <h2 className="text-lg font-semibold">Where we are</h2>
        <p className="text-xs text-muted-foreground">
          {board
            ? `Live from each vertical's own source. Read ${new Date(board.checked_at).toLocaleTimeString()}.`
            : "Reading each vertical's source..."}
        </p>
      </div>

      {error && (
        <p
          className="mb-4 rounded-md px-3 py-2 text-xs"
          style={{ background: LIGHT.red.bg, color: LIGHT.red.fg }}
        >
          The board could not be refreshed ({error}). Anything shown below is the last
          confirmed read, not the current state.
        </p>
      )}

      <div className="flex flex-col gap-3">
        {board?.ladders.map((ladder) => (
          <Ladder key={`${ladder.vertical}:${ladder.client_code ?? "*"}`} ladder={ladder} />
        ))}
        {board?.unregistered.map((vertical) => (
          <Unregistered key={vertical} vertical={vertical} />
        ))}
      </div>
    </div>
  );
}
