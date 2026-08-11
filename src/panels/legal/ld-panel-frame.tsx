import type { ReactNode } from "react";
import { getVocabulary } from "@/config";
import { LdSurface, LdHeader, LdBody, LdEmpty, LdExplain } from "./ld-kit";
import type { LegalDataState } from "./use-legal-data";

/** The plain-English copy every legal panel must supply. Each panel exports its
 *  own so the fixture harness shows the same words the app does. */
export interface LdExplainCopy {
  /** One sentence a non-lawyer understands. */
  what: string;
  /** What to do next, given rows exist. */
  next: string;
  /** What to do next when there are zero rows. */
  nextWhenEmpty?: string;
}

interface LdPanelFrameProps<T> {
  title: string;
  meta?: ReactNode;
  state: LegalDataState<T>;
  /** what the panel is waiting to show, e.g. "parties" — completes the sentence
   *  "Select a matter to see …". */
  subject: string;
  /** REQUIRED. Ruling 2026-08-10: no legal panel renders without its explainer. */
  explain: LdExplainCopy;
  render: (data: T) => ReactNode;
  footer?: (data: T) => ReactNode;
  /** Rows in the ready state, so "where you are" can state a count. Optional —
   *  a panel whose payload is not a list simply does not pass it. */
  countOf?: (data: T) => number;
}

/**
 * One place where every non-ready state is written, so no panel invents its own
 * phrasing for "nothing selected" or "this failed". Copy is sentence case and
 * names no vendor, store or table.
 *
 * EXPLAIN-FIRST (ruling, Dave 2026-08-10): the plain-English block renders
 * directly under the title and ABOVE the panel body in every state — including
 * the empty and failed ones, where a reader most needs telling what they are
 * looking at. `explain` is a required prop precisely so this cannot be skipped.
 */
export function LdPanelFrame<T>({
  title,
  meta,
  state,
  subject,
  explain,
  render,
  footer,
  countOf,
}: LdPanelFrameProps<T>) {
  const entity = getVocabulary().entity.toLowerCase();

  let body: ReactNode;
  let where: ReactNode;
  let next: ReactNode;

  switch (state.kind) {
    case "unavailable":
      body = <LdEmpty line="This panel is not available in this workspace." />;
      where = "This workspace does not carry this table.";
      next = "Nothing to do here — use the panels this workspace does carry.";
      break;
    case "awaiting-entity":
      body = <LdEmpty line={`Select a ${entity} to see ${subject}.`} />;
      where = `No ${entity} is open.`;
      next = `Pick a ${entity} and this fills in.`;
      break;
    case "loading":
      body = <LdEmpty line="Loading…" />;
      where = "Reading the record.";
      next = "Give it a moment.";
      break;
    case "error":
      body = <LdEmpty line={`${title} could not be loaded right now.`} />;
      where = "This did not load.";
      next = "Try again shortly. Nothing has been changed.";
      break;
    case "ready": {
      body = render(state.data);
      const count = countOf ? countOf(state.data) : null;
      where =
        count === null
          ? meta
            ? <>Showing {subject} for {meta}.</>
            : `Showing ${subject}.`
          : count === 0
            ? `Nothing recorded${meta ? "" : " here"} yet — a normal reading, not a failure.`
            : <>{count} recorded{meta ? <> for {meta}</> : null}.</>;
      next = count === 0 ? explain.nextWhenEmpty ?? explain.next : explain.next;
      break;
    }
  }

  return (
    <LdSurface>
      <LdHeader title={title} meta={meta} />
      <LdExplain what={explain.what} where={where} next={next} />
      <LdBody>{body}</LdBody>
      {state.kind === "ready" && footer ? footer(state.data) : null}
    </LdSurface>
  );
}
