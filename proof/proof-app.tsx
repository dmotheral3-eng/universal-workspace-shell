import { StrictMode, useEffect, type ReactNode } from "react";
import { createRoot } from "react-dom/client";

import "../src/index.css";
import { bus } from "../src/bus";
import { TooltipProvider } from "../src/components/ui/tooltip";
import { LayoutProvider } from "../src/shell/layout-context";
import { PanelScopeProvider } from "../src/shell/panel-scope";
import type { PanelTab } from "../src/shell/layout-tree";
import { EntityListPanel } from "../src/panels/entity-list";
import { DocBrowserPanel } from "../src/panels/doc-browser";
import { MatterHomePanel } from "../src/panels/matter-home";
import { ItemTablePanel } from "../src/panels/item-table";
import { ReadingPanePanel } from "../src/panels/reading-pane";
import { matters, timeline } from "./fixtures";

/**
 * AFTER harness for the proof shots (D-LDUX-2, extended by D-LDUX-5).
 *
 * One panel per page load, filling the viewport, chosen with ?screen=. Panels are
 * imported as they ship — nothing is re-implemented here, so a shot that looks
 * wrong means the panel is wrong.
 *
 * The chronology panel reads its view from the `chron` URL parameter, which is
 * how ?screen=timeline photographs the density view without a click: the harness
 * cannot interact, and a shot that needed a click would not be reproducible.
 */

const TAB: PanelTab = { id: "proof-tab", panelType: "EntityList", title: "Proof" };

/** Panels learn which matter is open from the bus. A parent effect runs after the
 *  children's, so by the time this fires every panel has subscribed. */
function WithMatter({ children }: { children: ReactNode }) {
  useEffect(() => {
    const m = matters[0];
    bus.emit("entity.selected", { scopeId: TAB.id, entityId: m.id, entityName: m.name });
    bus.emit("chat.context", {
      scopeId: TAB.id,
      entityId: m.id,
      entityName: m.name,
      itemId: null,
      itemTitle: null,
    });
  }, []);
  return <>{children}</>;
}

/** The reader has nothing to read until something is clicked, so the harness
 *  plays the click: one fact, announced on the bus exactly as the chronology
 *  announces it. */
function WithFact({ children }: { children: ReactNode }) {
  useEffect(() => {
    const fact = timeline[3];
    bus.emit("item.selected", {
      scopeId: TAB.id,
      itemId: fact.id,
      itemTitle: fact.title,
      entityId: fact.entityId,
    });
  }, []);
  return <>{children}</>;
}

function Screen() {
  const which = new URLSearchParams(window.location.search).get("screen") ?? "matters";

  if (which === "matters") return <EntityListPanel />;
  if (which === "evidence")
    return (
      <WithMatter>
        <DocBrowserPanel />
      </WithMatter>
    );
  if (which === "chronology" || which === "timeline")
    return (
      <WithMatter>
        <ItemTablePanel />
      </WithMatter>
    );
  if (which === "reader")
    return (
      <WithMatter>
        <WithFact>
          <ReadingPanePanel />
        </WithFact>
      </WithMatter>
    );
  return (
    <WithMatter>
      <MatterHomePanel />
    </WithMatter>
  );
}

function Proof() {
  return (
    <TooltipProvider>
      <LayoutProvider>
        <PanelScopeProvider value={{ tab: TAB, leafId: "proof-leaf", tabIndex: 0 }}>
          <div className="h-screen w-screen overflow-hidden bg-background">
            <Screen />
          </div>
        </PanelScopeProvider>
      </LayoutProvider>
    </TooltipProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Proof />
  </StrictMode>
);
