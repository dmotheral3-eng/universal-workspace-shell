import { createContext, useContext, useCallback, useState, useEffect, useRef, type ReactNode } from "react";
import type { WorkspaceLayout, LayoutNode, PanelTab, DropZone, NamedLayout, PoppedOutPanel } from "./layout-tree";
import { removeNode, insertAtDropZone, generateId, createLeaf, createTab, serializeLayout, deserializeLayout } from "./layout-tree";
import { getPreset } from "./presets";
import { getConfig, type PanelType } from "@/config";

function getPanelTitle(panelType: PanelType, instanceNum?: number): string {
  const vocab = getConfig().vocabulary;
  let base: string;
  switch (panelType) {
    case "EntityList": base = vocab.entityPlural; break;
    case "ItemTable": base = vocab.itemPlural; break;
    case "ReadingPane": base = "Reading Pane"; break;
    case "ChatRail": base = "Assistant"; break;
    case "StageTracker": base = "Stages"; break;
    case "DocBrowser": base = "Documents"; break;
    case "MetricGrid": base = "Metrics"; break;
    default: base = panelType;
  }
  if (instanceNum && instanceNum > 1) return `${base} #${instanceNum}`;
  return base;
}

interface LayoutContextValue {
  layout: WorkspaceLayout;
  setLayout: (layout: WorkspaceLayout) => void;
  closeTab: (leafId: string, tabIndex: number) => void;
  moveTab: (sourceLeafId: string, tabIndex: number, targetLeafId: string, zone: DropZone) => void;
  restorePanel: (tab: PanelTab) => void;
  collapsePanel: (leafId: string, tabIndex: number) => void;
  maximizedPanel: string | null;
  setMaximizedPanel: (id: string | null) => void;
  switchLayout: (name: string) => void;
  resetToDefault: () => void;
  undo: () => void;
  canUndo: boolean;
  savedLayouts: NamedLayout[];
  saveLayout: (name: string) => void;
  loadLayout: (name: string) => void;
  deleteLayout: (name: string) => void;
  exportLayout: () => string;
  importLayout: (json: string) => void;
  updateSizes: (splitId: string, sizes: number[]) => void;
  isPanelVisible: (panelType: PanelType) => boolean;
  openPanel: (panelType: PanelType) => void;
  openNewInstance: (panelType: PanelType) => void;
  getVisiblePanelTypes: () => PanelType[];
  getAllTabs: () => PanelTab[];
  getTabsByType: (panelType: PanelType) => PanelTab[];
  setScopeForTab: (tabId: string, scopeId: string | undefined) => void;
  popOutPanel: (leafId: string, tabIndex: number) => void;
  returnPoppedPanel: (tabId: string) => void;
  poppedOutPanels: PoppedOutPanel[];
}

const LayoutContext = createContext<LayoutContextValue | null>(null);

export function useLayout(): LayoutContextValue {
  const ctx = useContext(LayoutContext);
  if (!ctx) throw new Error("useLayout must be used within LayoutProvider");
  return ctx;
}

function updateNodeSizes(root: LayoutNode, splitId: string, sizes: number[]): LayoutNode {
  if (root.type === "split" && root.id === splitId) {
    return { ...root, sizes };
  }
  if (root.type === "split") {
    return { ...root, children: root.children.map((c) => updateNodeSizes(c, splitId, sizes)) };
  }
  return root;
}

function collectPanelTypes(node: LayoutNode): PanelType[] {
  if (node.type === "leaf") {
    return node.tabs.map((t) => t.panelType);
  }
  return node.children.flatMap(collectPanelTypes);
}

function collectAllTabs(node: LayoutNode): PanelTab[] {
  if (node.type === "leaf") {
    return [...node.tabs];
  }
  return node.children.flatMap(collectAllTabs);
}

function updateTabInTree(root: LayoutNode, tabId: string, updater: (tab: PanelTab) => PanelTab): LayoutNode {
  if (root.type === "leaf") {
    const updated = root.tabs.map((t) => (t.id === tabId ? updater(t) : t));
    if (updated === root.tabs) return root;
    return { ...root, tabs: updated };
  }
  return { ...root, children: root.children.map((c) => updateTabInTree(c, tabId, updater)) };
}

const MAX_UNDO = 50;

export function LayoutProvider({ children }: { children: ReactNode }) {
  const config = getConfig();
  const [layout, setLayoutState] = useState<WorkspaceLayout>(() => getPreset(config.defaultLayout));
  const [savedLayouts, setSavedLayouts] = useState<NamedLayout[]>([]);
  const [maximizedPanel, setMaximizedPanel] = useState<string | null>(null);
  const [undoStack, setUndoStack] = useState<WorkspaceLayout[]>([]);
  const skipUndoPush = useRef(false);

  const pushUndo = useCallback((prev: WorkspaceLayout) => {
    if (skipUndoPush.current) {
      skipUndoPush.current = false;
      return;
    }
    setUndoStack((stack) => {
      const next = [...stack, prev];
      if (next.length > MAX_UNDO) next.shift();
      return next;
    });
  }, []);

  const setLayout = useCallback((newLayout: WorkspaceLayout) => {
    setLayoutState((prev) => {
      pushUndo(prev);
      return newLayout;
    });
  }, [pushUndo]);

  const setLayoutWithUndo = useCallback((updater: (prev: WorkspaceLayout) => WorkspaceLayout) => {
    setLayoutState((prev) => {
      const next = updater(prev);
      if (next === prev) return prev;
      pushUndo(prev);
      return next;
    });
  }, [pushUndo]);

  const undo = useCallback(() => {
    setUndoStack((stack) => {
      if (stack.length === 0) return stack;
      const newStack = [...stack];
      const previous = newStack.pop()!;
      skipUndoPush.current = true;
      setLayoutState(previous);
      setMaximizedPanel(null);
      return newStack;
    });
  }, []);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "z" && (e.metaKey || e.ctrlKey) && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [undo]);

  const closeTab = useCallback((leafId: string, tabIndex: number) => {
    setLayoutWithUndo((prev) => {
      const root = prev.root;
      const leafNode = findLeaf(root, leafId);
      if (!leafNode) return prev;

      if (leafNode.tabs.length <= 1) {
        const removed = removeNode(root, leafId);
        if (removed) return { ...prev, root: removed };
        return { ...prev, root: createLeaf(leafId, []) };
      }

      const updateLeaf = (node: LayoutNode): LayoutNode => {
        if (node.type === "leaf" && node.id === leafId) {
          const newTabs = node.tabs.filter((_, i) => i !== tabIndex);
          const newActive = Math.min(node.activeTabIndex, newTabs.length - 1);
          return { ...node, tabs: newTabs, activeTabIndex: newActive };
        }
        if (node.type === "split") {
          return { ...node, children: node.children.map(updateLeaf) };
        }
        return node;
      };

      return { ...prev, root: updateLeaf(root) };
    });
  }, [setLayoutWithUndo]);

  const collapsePanel = useCallback((leafId: string, tabIndex: number) => {
    setLayoutWithUndo((prev) => {
      const leaf = findLeaf(prev.root, leafId);
      if (!leaf) return prev;
      const tab = leaf.tabs[tabIndex];
      if (!tab) return prev;

      const newCollapsed = [...prev.collapsedPanels, tab];
      const newTabs = leaf.tabs.filter((_, i) => i !== tabIndex);

      if (newTabs.length === 0) {
        const newRoot = removeNode(prev.root, leafId);
        return { ...prev, root: newRoot ?? createLeaf(leafId, []), collapsedPanels: newCollapsed };
      }

      const updateLeaf = (node: LayoutNode): LayoutNode => {
        if (node.type === "leaf" && node.id === leafId) {
          return { ...node, tabs: newTabs, activeTabIndex: Math.min(leaf.activeTabIndex, newTabs.length - 1) };
        }
        if (node.type === "split") return { ...node, children: node.children.map(updateLeaf) };
        return node;
      };

      return { ...prev, root: updateLeaf(prev.root), collapsedPanels: newCollapsed };
    });
  }, [setLayoutWithUndo]);

  const restorePanel = useCallback((tab: PanelTab) => {
    setLayoutWithUndo((prev) => {
      const newCollapsed = prev.collapsedPanels.filter((t) => t.id !== tab.id);
      const lastLeaf = findLastLeaf(prev.root);
      if (lastLeaf) {
        const newRoot = insertAtDropZone(prev.root, lastLeaf.id, tab, "right");
        return { ...prev, root: newRoot, collapsedPanels: newCollapsed };
      }
      const newRoot = createLeaf(generateId(), [tab]);
      return { ...prev, root: newRoot, collapsedPanels: newCollapsed };
    });
  }, [setLayoutWithUndo]);

  const moveTab = useCallback((sourceLeafId: string, tabIndex: number, targetLeafId: string, zone: DropZone) => {
    setLayoutWithUndo((prev) => {
      const sourceLeaf = findLeaf(prev.root, sourceLeafId);
      if (!sourceLeaf) return prev;
      const tab = sourceLeaf.tabs[tabIndex];
      if (!tab) return prev;

      let newRoot = prev.root;
      const sourceTabs = sourceLeaf.tabs.filter((_, i) => i !== tabIndex);
      if (sourceTabs.length === 0) {
        const removed = removeNode(newRoot, sourceLeafId);
        if (!removed) return prev;
        newRoot = removed;
      } else {
        const updateSource = (node: LayoutNode): LayoutNode => {
          if (node.type === "leaf" && node.id === sourceLeafId) {
            return { ...node, tabs: sourceTabs, activeTabIndex: Math.min(node.activeTabIndex, sourceTabs.length - 1) };
          }
          if (node.type === "split") return { ...node, children: node.children.map(updateSource) };
          return node;
        };
        newRoot = updateSource(newRoot);
      }

      newRoot = insertAtDropZone(newRoot, targetLeafId, tab, zone);
      return { ...prev, root: newRoot };
    });
  }, [setLayoutWithUndo]);

  const switchLayout = useCallback((name: string) => {
    setLayoutWithUndo(() => {
      setMaximizedPanel(null);
      return getPreset(name);
    });
  }, [setLayoutWithUndo]);

  const resetToDefault = useCallback(() => {
    setLayoutWithUndo(() => {
      setMaximizedPanel(null);
      return getPreset("Classic");
    });
  }, [setLayoutWithUndo]);

  const saveLayout = useCallback((name: string) => {
    setSavedLayouts((prev) => {
      const filtered = prev.filter((l) => l.name !== name);
      return [...filtered, { name, layout }];
    });
  }, [layout]);

  const loadLayout = useCallback((name: string) => {
    const found = savedLayouts.find((l) => l.name === name);
    if (found) {
      setLayoutWithUndo(() => {
        setMaximizedPanel(null);
        return found.layout;
      });
    }
  }, [savedLayouts, setLayoutWithUndo]);

  const deleteLayout = useCallback((name: string) => {
    setSavedLayouts((prev) => prev.filter((l) => l.name !== name));
  }, []);

  const exportLayout = useCallback((): string => {
    return serializeLayout(layout);
  }, [layout]);

  const importLayout = useCallback((json: string) => {
    const imported = deserializeLayout(json);
    setLayoutWithUndo(() => {
      setMaximizedPanel(null);
      return imported;
    });
  }, [setLayoutWithUndo]);

  const updateSizes = useCallback((splitId: string, sizes: number[]) => {
    setLayoutState((prev) => ({
      ...prev,
      root: updateNodeSizes(prev.root, splitId, sizes),
    }));
  }, []);

  const isPanelVisible = useCallback((panelType: PanelType): boolean => {
    const visibleTypes = collectPanelTypes(layout.root);
    return visibleTypes.includes(panelType);
  }, [layout]);

  const getVisiblePanelTypes = useCallback((): PanelType[] => {
    return collectPanelTypes(layout.root);
  }, [layout]);

  const getAllTabs = useCallback((): PanelTab[] => {
    return collectAllTabs(layout.root);
  }, [layout]);

  const getTabsByType = useCallback((panelType: PanelType): PanelTab[] => {
    return collectAllTabs(layout.root).filter((t) => t.panelType === panelType);
  }, [layout]);

  const openPanel = useCallback((panelType: PanelType) => {
    const inCollapsed = layout.collapsedPanels.find((t) => t.panelType === panelType);
    if (inCollapsed) {
      restorePanel(inCollapsed);
      return;
    }
    if (isPanelVisible(panelType)) return;
    openNewInstanceInternal(panelType);
  }, [layout, restorePanel, isPanelVisible]);

  function openNewInstanceInternal(panelType: PanelType) {
    const existingCount = collectAllTabs(layout.root).filter((t) => t.panelType === panelType).length
      + layout.collapsedPanels.filter((t) => t.panelType === panelType).length;
    const num = existingCount + 1;
    const tab = createTab(
      `${panelType.toLowerCase()}-${generateId()}`,
      panelType,
      getPanelTitle(panelType, num)
    );
    setLayoutWithUndo((prev) => {
      if (prev.root.type === "leaf" && prev.root.tabs.length === 0) {
        return { ...prev, root: createLeaf(prev.root.id, [tab]) };
      }
      const lastLeaf = findLastLeaf(prev.root);
      if (lastLeaf) {
        const newRoot = insertAtDropZone(prev.root, lastLeaf.id, tab, "right");
        return { ...prev, root: newRoot };
      }
      return { ...prev, root: createLeaf(generateId(), [tab]) };
    });
  }

  const openNewInstance = useCallback((panelType: PanelType) => {
    openNewInstanceInternal(panelType);
  }, [layout, setLayoutWithUndo]);

  const setScopeForTab = useCallback((tabId: string, scopeId: string | undefined) => {
    setLayoutState((prev) => ({
      ...prev,
      root: updateTabInTree(prev.root, tabId, (t) => ({ ...t, scopeId })),
    }));
  }, []);

  const popOutPanel = useCallback((leafId: string, tabIndex: number) => {
    setLayoutWithUndo((prev) => {
      const leaf = findLeaf(prev.root, leafId);
      if (!leaf) return prev;
      const tab = leaf.tabs[tabIndex];
      if (!tab) return prev;

      const poppedEntry: PoppedOutPanel = { tab, leafId };
      const newTabs = leaf.tabs.filter((_, i) => i !== tabIndex);

      let newRoot = prev.root;
      if (newTabs.length === 0) {
        const removed = removeNode(prev.root, leafId);
        newRoot = removed ?? createLeaf(leafId, []);
      } else {
        const updateLeaf = (node: LayoutNode): LayoutNode => {
          if (node.type === "leaf" && node.id === leafId) {
            return { ...node, tabs: newTabs, activeTabIndex: Math.min(leaf.activeTabIndex, newTabs.length - 1) };
          }
          if (node.type === "split") return { ...node, children: node.children.map(updateLeaf) };
          return node;
        };
        newRoot = updateLeaf(prev.root);
      }

      return {
        ...prev,
        root: newRoot,
        poppedOutPanels: [...(prev.poppedOutPanels ?? []), poppedEntry],
      };
    });
  }, [setLayoutWithUndo]);

  const returnPoppedPanel = useCallback((tabId: string) => {
    setLayoutWithUndo((prev) => {
      const popped = (prev.poppedOutPanels ?? []).find((p) => p.tab.id === tabId);
      if (!popped) return prev;

      const newPopped = (prev.poppedOutPanels ?? []).filter((p) => p.tab.id !== tabId);
      const lastLeaf = findLastLeaf(prev.root);
      let newRoot: LayoutNode;
      if (lastLeaf) {
        newRoot = insertAtDropZone(prev.root, lastLeaf.id, popped.tab, "right");
      } else {
        newRoot = createLeaf(generateId(), [popped.tab]);
      }

      return { ...prev, root: newRoot, poppedOutPanels: newPopped };
    });
  }, [setLayoutWithUndo]);

  return (
    <LayoutContext.Provider
      value={{
        layout, setLayout, closeTab, moveTab, restorePanel, collapsePanel,
        maximizedPanel, setMaximizedPanel, switchLayout, resetToDefault,
        undo, canUndo: undoStack.length > 0,
        savedLayouts, saveLayout, loadLayout, deleteLayout,
        exportLayout, importLayout, updateSizes,
        isPanelVisible, openPanel, openNewInstance, getVisiblePanelTypes,
        getAllTabs, getTabsByType, setScopeForTab,
        popOutPanel, returnPoppedPanel, poppedOutPanels: layout.poppedOutPanels ?? [],
      }}
    >
      {children}
    </LayoutContext.Provider>
  );
}

function findLeaf(root: LayoutNode, id: string): import("./layout-tree").LayoutLeaf | null {
  if (root.type === "leaf" && root.id === id) return root;
  if (root.type === "split") {
    for (const child of root.children) {
      const found = findLeaf(child, id);
      if (found) return found;
    }
  }
  return null;
}

function findLastLeaf(root: LayoutNode): import("./layout-tree").LayoutLeaf | null {
  if (root.type === "leaf") return root;
  if (root.type === "split" && root.children.length > 0) {
    return findLastLeaf(root.children[root.children.length - 1]);
  }
  return null;
}
