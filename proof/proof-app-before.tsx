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
import { ItemTablePanel } from "../src/panels/item-table";
import { matters } from "./fixtures";

/**
 * BEFORE harness — the same three screens, rendered from the tree as it stood on
 * main before D-LDUX-2. This file is copied into a worktree checked out at
 * origin/main by scripts/ldux2-proof.sh.
 *
 * It differs from proof-app.tsx in exactly one way, and the difference IS the
 * finding: there was no matter-detail screen to photograph. The centre column of
 * the Classic layout landed on the timeline table, so that is what stands in for
 * "a matter detail" in the before column.
 */

const TAB: PanelTab = { id: "proof-tab", panelType: "EntityList", title: "Proof" };

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

function Screen() {
  const which = new URLSearchParams(window.location.search).get("screen") ?? "matters";

  if (which === "matters") return <EntityListPanel />;
  if (which === "evidence")
    return (
      <WithMatter>
        <DocBrowserPanel />
      </WithMatter>
    );
  return (
    <WithMatter>
      <ItemTablePanel />
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
