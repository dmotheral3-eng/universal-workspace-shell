import type { PanelType } from "@/config/types";

export type SplitDirection = "horizontal" | "vertical";

export interface LayoutLeaf {
  type: "leaf";
  id: string;
  tabs: PanelTab[];
  activeTabIndex: number;
}

export interface LayoutSplit {
  type: "split";
  id: string;
  direction: SplitDirection;
  children: LayoutNode[];
  sizes: number[];
}

export type LayoutNode = LayoutLeaf | LayoutSplit;

export interface PanelTab {
  id: string;
  panelType: PanelType;
  title: string;
  scopeId?: string;
}

export interface PanelState {
  collapsed: boolean;
  maximized: boolean;
  floating: boolean;
  floatPosition?: { x: number; y: number; width: number; height: number };
}

export interface PoppedOutPanel {
  tab: PanelTab;
  leafId: string;
}

export interface WorkspaceLayout {
  root: LayoutNode;
  panelStates: Record<string, PanelState>;
  collapsedPanels: PanelTab[];
  poppedOutPanels: PoppedOutPanel[];
}

export interface NamedLayout {
  name: string;
  layout: WorkspaceLayout;
}

export function createLeaf(id: string, tabs: PanelTab[], activeTabIndex?: number): LayoutLeaf {
  return { type: "leaf", id, tabs, activeTabIndex: activeTabIndex ?? 0 };
}

export function createSplit(
  id: string,
  direction: SplitDirection,
  children: LayoutNode[],
  sizes?: number[]
): LayoutSplit {
  const defaultSizes = children.map(() => 100 / children.length);
  return { type: "split", id, direction, children, sizes: sizes ?? defaultSizes };
}

export function createTab(id: string, panelType: PanelType, title: string): PanelTab {
  return { id, panelType, title };
}

let idCounter = 0;
export function generateId(): string {
  return `node_${Date.now()}_${idCounter++}`;
}

export function findNodeById(root: LayoutNode, id: string): LayoutNode | null {
  if (root.id === id) return root;
  if (root.type === "split") {
    for (const child of root.children) {
      const found = findNodeById(child, id);
      if (found) return found;
    }
  }
  return null;
}

export function findParent(root: LayoutNode, targetId: string): LayoutSplit | null {
  if (root.type === "split") {
    for (const child of root.children) {
      if (child.id === targetId) return root;
      const found = findParent(child, targetId);
      if (found) return found;
    }
  }
  return null;
}

export function removeNode(root: LayoutNode, targetId: string): LayoutNode | null {
  if (root.id === targetId) return null;
  if (root.type === "leaf") return root;
  
  const newChildren: LayoutNode[] = [];
  const newSizes: number[] = [];
  
  for (let i = 0; i < root.children.length; i++) {
    if (root.children[i].id === targetId) continue;
    const result = removeNode(root.children[i], targetId);
    if (result) {
      newChildren.push(result);
      newSizes.push(root.sizes[i]);
    }
  }
  
  if (newChildren.length === 0) return null;
  if (newChildren.length === 1) return newChildren[0];
  
  const total = newSizes.reduce((a, b) => a + b, 0);
  const normalizedSizes = newSizes.map((s) => (s / total) * 100);
  
  return { ...root, children: newChildren, sizes: normalizedSizes };
}

export type DropZone = "left" | "right" | "top" | "bottom" | "center";

export function insertAtDropZone(
  root: LayoutNode,
  targetId: string,
  tab: PanelTab,
  zone: DropZone
): LayoutNode {
  if (zone === "center") {
    return addTabToLeaf(root, targetId, tab);
  }
  
  const direction: SplitDirection = (zone === "left" || zone === "right") ? "horizontal" : "vertical";
  const newLeaf = createLeaf(generateId(), [tab]);
  
  return splitNode(root, targetId, newLeaf, direction, zone === "right" || zone === "bottom");
}

function addTabToLeaf(root: LayoutNode, targetId: string, tab: PanelTab): LayoutNode {
  if (root.type === "leaf" && root.id === targetId) {
    return { ...root, tabs: [...root.tabs, tab], activeTabIndex: root.tabs.length };
  }
  if (root.type === "split") {
    return { ...root, children: root.children.map((c) => addTabToLeaf(c, targetId, tab)) };
  }
  return root;
}

function splitNode(
  root: LayoutNode,
  targetId: string,
  newNode: LayoutNode,
  direction: SplitDirection,
  insertAfter: boolean
): LayoutNode {
  if (root.id === targetId) {
    const children = insertAfter ? [root, newNode] : [newNode, root];
    return createSplit(generateId(), direction, children, [50, 50]);
  }
  if (root.type === "split") {
    return { ...root, children: root.children.map((c) => splitNode(c, targetId, newNode, direction, insertAfter)) };
  }
  return root;
}

// ---- panel navigation ---------------------------------------------------------

/** Where a panel type currently lives in the tree, if it lives anywhere. */
export function findTabOfType(
  node: LayoutNode,
  panelType: PanelType
): { leafId: string; tabIndex: number } | null {
  if (node.type === "leaf") {
    const tabIndex = node.tabs.findIndex((t) => t.panelType === panelType);
    return tabIndex >= 0 ? { leafId: node.id, tabIndex } : null;
  }
  for (const child of node.children) {
    const found = findTabOfType(child, panelType);
    if (found) return found;
  }
  return null;
}

export function setActiveTabIndex(root: LayoutNode, leafId: string, tabIndex: number): LayoutNode {
  if (root.type === "leaf") {
    return root.id === leafId ? { ...root, activeTabIndex: tabIndex } : root;
  }
  return { ...root, children: root.children.map((c) => setActiveTabIndex(c, leafId, tabIndex)) };
}

/**
 * What "take me to that panel" has to do, given where the panel is now.
 *
 * Pure on purpose: this is the decision D-LDNAV-1 got wrong. The old code asked
 * "is this panel present anywhere?" and stopped if the answer was yes — so every
 * card pointing at a BACKGROUND TAB was a link that did nothing. Being a tab is
 * not being on screen, and the difference is this function.
 */
export type PanelTarget =
  | { kind: "raise"; leafId: string; tabIndex: number }
  | { kind: "restore"; tab: PanelTab }
  | { kind: "mount" };

export function resolvePanelTarget(layout: WorkspaceLayout, panelType: PanelType): PanelTarget {
  const found = findTabOfType(layout.root, panelType);
  if (found) return { kind: "raise", ...found };
  const collapsed = layout.collapsedPanels.find((t) => t.panelType === panelType);
  if (collapsed) return { kind: "restore", tab: collapsed };
  return { kind: "mount" };
}

export function serializeLayout(layout: WorkspaceLayout): string {
  return JSON.stringify(layout, null, 2);
}

export function deserializeLayout(json: string): WorkspaceLayout {
  return JSON.parse(json) as WorkspaceLayout;
}
