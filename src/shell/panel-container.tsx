import { useState, useCallback, type DragEvent } from "react";
import type { LayoutLeaf, DropZone } from "./layout-tree";
import { useLayout } from "./layout-context";
import { PanelScopeProvider } from "./panel-scope";
import { PanelRegistry } from "@/registry";
import { MoreHorizontal, Minimize2, Maximize2, X, GripVertical, Link, ExternalLink } from "lucide-react";
import { useOpenPopout } from "./popout-context";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface PanelContainerProps {
  leaf: LayoutLeaf;
}

export function PanelContainer({ leaf }: PanelContainerProps) {
  const { closeTab, collapsePanel, maximizedPanel, setMaximizedPanel, moveTab, getTabsByType, setScopeForTab } = useLayout();
  const openPopout = useOpenPopout();
  const [dropZone, setDropZone] = useState<DropZone | null>(null);
  const activeTab = leaf.tabs[leaf.activeTabIndex];

  const entityLists = getTabsByType("EntityList");

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    const margin = 0.25;
    if (x < margin) setDropZone("left");
    else if (x > 1 - margin) setDropZone("right");
    else if (y < margin) setDropZone("top");
    else if (y > 1 - margin) setDropZone("bottom");
    else setDropZone("center");
  }, []);

  const handleDragLeave = useCallback(() => setDropZone(null), []);

  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault();
    setDropZone(null);
    const data = e.dataTransfer.getData("application/panel-tab");
    if (!data) return;
    const { sourceLeafId, tabIndex } = JSON.parse(data) as { sourceLeafId: string; tabIndex: number };
    if (sourceLeafId === leaf.id && dropZone === "center") return;
    if (dropZone) {
      moveTab(sourceLeafId, tabIndex, leaf.id, dropZone);
    }
  }, [leaf.id, dropZone, moveTab]);

  const showFollowMenu = activeTab && activeTab.panelType !== "EntityList" && entityLists.length > 0;

  return (
    <div
      className="relative flex h-full w-full flex-col border border-border bg-card"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {dropZone && <DropZoneIndicator zone={dropZone} />}
      <TabBar leaf={leaf} />
      <div className="flex-1 overflow-hidden">
        {activeTab && (
          <PanelScopeProvider value={{ tab: activeTab, leafId: leaf.id, tabIndex: leaf.activeTabIndex }}>
            <PanelRegistry panelType={activeTab.panelType} />
          </PanelScopeProvider>
        )}
      </div>
      {activeTab && (
        <div className="absolute right-1 top-0.5 flex items-center gap-0.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground">
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {showFollowMenu && (
                <>
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger className="text-xs">
                      <Link className="mr-2 h-3.5 w-3.5" />
                      Follow scope
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      <DropdownMenuItem
                        onClick={() => setScopeForTab(activeTab.id, undefined)}
                        className="text-xs"
                      >
                        Any (auto)
                        {!activeTab.scopeId && <span className="ml-auto text-[10px] text-muted-foreground">current</span>}
                      </DropdownMenuItem>
                      {entityLists.map((el) => (
                        <DropdownMenuItem
                          key={el.id}
                          onClick={() => setScopeForTab(activeTab.id, el.id)}
                          className="text-xs"
                        >
                          {el.title}
                          {activeTab.scopeId === el.id && <span className="ml-auto text-[10px] text-muted-foreground">current</span>}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuItem onClick={() => openPopout(leaf.id, leaf.activeTabIndex, activeTab)} className="text-xs">
                <ExternalLink className="mr-2 h-3.5 w-3.5" />
                Move to new window
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => collapsePanel(leaf.id, leaf.activeTabIndex)} className="text-xs">
                <Minimize2 className="mr-2 h-3.5 w-3.5" />
                Collapse
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setMaximizedPanel(maximizedPanel === leaf.id ? null : leaf.id)} className="text-xs">
                <Maximize2 className="mr-2 h-3.5 w-3.5" />
                {maximizedPanel === leaf.id ? "Restore" : "Maximize"}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => closeTab(leaf.id, leaf.activeTabIndex)} className="text-xs">
                <X className="mr-2 h-3.5 w-3.5" />
                Close
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  );
}

function TabBar({ leaf }: { leaf: LayoutLeaf }) {
  const { setLayout, layout } = useLayout();

  const setActiveTab = useCallback((index: number) => {
    const updateLeaf = (node: import("./layout-tree").LayoutNode): import("./layout-tree").LayoutNode => {
      if (node.type === "leaf" && node.id === leaf.id) {
        return { ...node, activeTabIndex: index };
      }
      if (node.type === "split") {
        return { ...node, children: node.children.map(updateLeaf) };
      }
      return node;
    };
    setLayout({ ...layout, root: updateLeaf(layout.root) });
  }, [leaf.id, layout, setLayout]);

  const handleDragStart = useCallback((e: DragEvent, tabIndex: number) => {
    e.dataTransfer.setData("application/panel-tab", JSON.stringify({ sourceLeafId: leaf.id, tabIndex }));
    e.dataTransfer.effectAllowed = "move";
  }, [leaf.id]);

  if (leaf.tabs.length === 0) return null;

  return (
    <div className="flex h-8 items-center border-b border-border bg-muted/30">
      <div className="flex items-center overflow-x-auto">
        {leaf.tabs.map((tab, index) => (
          <div
            key={tab.id}
            draggable
            onDragStart={(e) => handleDragStart(e, index)}
            onClick={() => setActiveTab(index)}
            className={`
              flex cursor-pointer items-center gap-1.5 border-r border-border px-3 py-1.5
              text-xs font-medium transition-colors select-none
              ${index === leaf.activeTabIndex
                ? "bg-card text-foreground"
                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              }
            `}
          >
            <GripVertical className="h-3 w-3 text-muted-foreground/50" />
            <span className="truncate max-w-[120px]">{tab.title}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DropZoneIndicator({ zone }: { zone: DropZone }) {
  const positions: Record<DropZone, string> = {
    left: "inset-y-0 left-0 w-1/4",
    right: "inset-y-0 right-0 w-1/4",
    top: "inset-x-0 top-0 h-1/4",
    bottom: "inset-x-0 bottom-0 h-1/4",
    center: "inset-0",
  };

  return (
    <div className={`pointer-events-none absolute z-20 ${positions[zone]} bg-ring/20 border-2 border-ring/40 rounded-sm`} />
  );
}
