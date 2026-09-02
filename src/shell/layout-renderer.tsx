import { useCallback, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import type { LayoutNode, LayoutLeaf, LayoutSplit } from "./layout-tree";
import { useLayout } from "./layout-context";
import { PanelContainer } from "./panel-container";

export function LayoutRenderer() {
  const { layout, maximizedPanel, resetToDefault } = useLayout();

  if (maximizedPanel) {
    return <MaximizedView leafId={maximizedPanel} />;
  }

  const isEmpty = layout.root.type === "leaf" && layout.root.tabs.length === 0;
  if (isEmpty) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-sm text-muted-foreground">All panels are closed.</p>
          <button
            onClick={resetToDefault}
            className="inline-flex items-center gap-1.5 rounded border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent transition-colors"
          >
            Reset to default layout
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-hidden">
      <NodeRenderer node={layout.root} />
    </div>
  );
}

function MaximizedView({ leafId }: { leafId: string }) {
  const { layout } = useLayout();
  const leaf = findLeafInNode(layout.root, leafId);
  if (!leaf) return null;
  return (
    <div className="flex-1 overflow-hidden">
      <PanelContainer leaf={leaf} />
    </div>
  );
}

function NodeRenderer({ node }: { node: LayoutNode }) {
  if (node.type === "leaf") {
    return <PanelContainer leaf={node} />;
  }
  return <SplitRenderer split={node} />;
}

function SplitRenderer({ split }: { split: LayoutSplit }) {
  const { updateSizes } = useLayout();
  const containerRef = useRef<HTMLDivElement>(null);
  const [resizingIndex, setResizingIndex] = useState<number | null>(null);

  const handleMouseDown = useCallback((index: number, e: ReactMouseEvent) => {
    e.preventDefault();
    setResizingIndex(index);

    const container = containerRef.current;
    if (!container) return;

    const isHorizontal = split.direction === "horizontal";
    const startPos = isHorizontal ? e.clientX : e.clientY;
    const containerSize = isHorizontal ? container.offsetWidth : container.offsetHeight;
    const startSizes = [...split.sizes];

    const handleMouseMove = (moveEvent: globalThis.MouseEvent) => {
      const currentPos = isHorizontal ? moveEvent.clientX : moveEvent.clientY;
      const delta = ((currentPos - startPos) / containerSize) * 100;

      const newSizes = [...startSizes];
      const minSize = 10;
      
      newSizes[index] = Math.max(minSize, startSizes[index] + delta);
      newSizes[index + 1] = Math.max(minSize, startSizes[index + 1] - delta);

      if (newSizes[index] >= minSize && newSizes[index + 1] >= minSize) {
        updateSizes(split.id, newSizes);
      }
    };

    const handleMouseUp = () => {
      setResizingIndex(null);
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    document.body.style.cursor = isHorizontal ? "col-resize" : "row-resize";
    document.body.style.userSelect = "none";
  }, [split.direction, split.id, split.sizes, updateSizes]);

  const isHorizontal = split.direction === "horizontal";

  return (
    <div
      ref={containerRef}
      className={`flex h-full w-full ${isHorizontal ? "flex-row" : "flex-col"}`}
    >
      {split.children.map((child, index) => {
        const clamp = split.clamps?.[index] ?? null;
        // The clamp rides on the flex basis, so dragging the splitter still works
        // and simply stops at the bound rather than being overridden by it.
        const clampStyle = clamp
          ? {
              ...(clamp.minPx !== undefined
                ? split.direction === "horizontal"
                  ? { minWidth: clamp.minPx }
                  : { minHeight: clamp.minPx }
                : {}),
              ...(clamp.maxPx !== undefined
                ? split.direction === "horizontal"
                  ? { maxWidth: clamp.maxPx }
                  : { maxHeight: clamp.maxPx }
                : {}),
            }
          : {};
        return (
        <div
          key={child.id}
          className="flex h-full w-full"
          style={{ flex: `0 0 ${split.sizes[index]}%`, ...clampStyle }}
        >
          <div className="flex-1 overflow-hidden">
            <NodeRenderer node={child} />
          </div>
          {index < split.children.length - 1 && (
            <div
              className={`
                relative z-10 flex-shrink-0
                ${isHorizontal ? "w-[3px] cursor-col-resize" : "h-[3px] cursor-row-resize"}
                ${resizingIndex === index ? "bg-ring" : "bg-border hover:bg-ring/50"}
                transition-colors
              `}
              onMouseDown={(e) => handleMouseDown(index, e)}
            />
          )}
        </div>
        );
      })}
    </div>
  );
}

function findLeafInNode(node: LayoutNode, id: string): LayoutLeaf | null {
  if (node.type === "leaf" && node.id === id) return node;
  if (node.type === "split") {
    for (const child of node.children) {
      const found = findLeafInNode(child, id);
      if (found) return found;
    }
  }
  return null;
}
