import type { ReactNode } from "react";
import { getVocabulary } from "@/config";
import { LdSurface, LdHeader, LdBody, LdEmpty } from "./ld-kit";
import type { LegalDataState } from "./use-legal-data";

interface LdPanelFrameProps<T> {
  title: string;
  meta?: ReactNode;
  state: LegalDataState<T>;
  /** what the panel is waiting to show, e.g. "parties" — completes the sentence
   *  "Select a matter to see …". */
  subject: string;
  render: (data: T) => ReactNode;
  footer?: (data: T) => ReactNode;
}

/**
 * One place where every non-ready state is written, so no panel invents its own
 * phrasing for "nothing selected" or "this failed". Copy is sentence case and
 * names no vendor, store or table.
 */
export function LdPanelFrame<T>({
  title,
  meta,
  state,
  subject,
  render,
  footer,
}: LdPanelFrameProps<T>) {
  const entity = getVocabulary().entity.toLowerCase();

  let body: ReactNode;
  switch (state.kind) {
    case "unavailable":
      body = <LdEmpty line="This panel is not available in this workspace." />;
      break;
    case "awaiting-entity":
      body = <LdEmpty line={`Select a ${entity} to see ${subject}.`} />;
      break;
    case "loading":
      body = <LdEmpty line="Loading…" />;
      break;
    case "error":
      body = <LdEmpty line={`${title} could not be loaded right now.`} />;
      break;
    case "ready":
      body = render(state.data);
      break;
  }

  return (
    <LdSurface>
      <LdHeader title={title} meta={meta} />
      <LdBody>{body}</LdBody>
      {state.kind === "ready" && footer ? footer(state.data) : null}
    </LdSurface>
  );
}
