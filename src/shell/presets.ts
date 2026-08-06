import type { WorkspaceLayout } from "./layout-tree";
import { createLeaf, createSplit, createTab } from "./layout-tree";
import { getConfig } from "@/config";

function v() {
  const vocab = getConfig().vocabulary;
  return vocab;
}

export function getClassicLayout(): WorkspaceLayout {
  const vocab = v();
  return {
    root: createSplit("root", "horizontal", [
      createLeaf("left", [createTab("entity-list", "EntityList", vocab.entityPlural)]),
      createSplit("center-right", "horizontal", [
        createLeaf("center", [createTab("item-table", "ItemTable", vocab.itemPlural)]),
        createSplit("right-col", "vertical", [
          createLeaf("reading", [createTab("reading-pane", "ReadingPane", "Reading Pane")]),
          createLeaf("chat", [createTab("chat-rail", "ChatRail", "Assistant")]),
        ], [60, 40]),
      ], [45, 55]),
    ], [22, 78]),
    panelStates: {},
    collapsedPanels: [
      createTab("stage-tracker", "StageTracker", "Stages"),
      createTab("doc-browser", "DocBrowser", "Documents"),
      createTab("metric-grid", "MetricGrid", "Metrics"),
      createTab("master-board", "MasterBoard", "Master Board"),
    ],
    poppedOutPanels: [],
  };
}

export function getFocusLayout(): WorkspaceLayout {
  return {
    root: createLeaf("focus-main", [
      createTab("reading-pane", "ReadingPane", "Reading Pane"),
    ]),
    panelStates: {},
    collapsedPanels: [
      createTab("entity-list", "EntityList", v().entityPlural),
      createTab("item-table", "ItemTable", v().itemPlural),
      createTab("chat-rail", "ChatRail", "Assistant"),
      createTab("stage-tracker", "StageTracker", "Stages"),
      createTab("doc-browser", "DocBrowser", "Documents"),
      createTab("metric-grid", "MetricGrid", "Metrics"),
      createTab("master-board", "MasterBoard", "Master Board"),
    ],
    poppedOutPanels: [],
  };
}

export function getOpsLayout(): WorkspaceLayout {
  return {
    root: createSplit("root", "vertical", [
      createSplit("top-row", "horizontal", [
        createLeaf("tl", [createTab("entity-list", "EntityList", v().entityPlural)]),
        createLeaf("tr", [createTab("item-table", "ItemTable", v().itemPlural)]),
      ], [50, 50]),
      createSplit("bottom-row", "horizontal", [
        createLeaf("bl", [
          createTab("reading-pane", "ReadingPane", "Reading Pane"),
          createTab("doc-browser", "DocBrowser", "Documents"),
        ]),
        createLeaf("br", [
          createTab("metric-grid", "MetricGrid", "Metrics"),
          createTab("stage-tracker", "StageTracker", "Stages"),
          createTab("chat-rail", "ChatRail", "Assistant"),
        ]),
      ], [50, 50]),
    ], [50, 50]),
    panelStates: {},
    collapsedPanels: [],
    poppedOutPanels: [],
  };
}

export function getWallLayout(): WorkspaceLayout {
  return {
    root: createSplit("root", "vertical", [
      createSplit("top-row", "horizontal", [
        createLeaf("tl", [createTab("entity-list", "EntityList", v().entityPlural)]),
        createLeaf("tc", [createTab("item-table", "ItemTable", v().itemPlural)]),
        createLeaf("tr", [createTab("reading-pane", "ReadingPane", "Reading Pane")]),
      ], [33, 34, 33]),
      createSplit("bottom-row", "horizontal", [
        createLeaf("bl", [createTab("stage-tracker", "StageTracker", "Stages")]),
        createLeaf("bc", [createTab("metric-grid", "MetricGrid", "Metrics")]),
        createLeaf("br", [
          createTab("doc-browser", "DocBrowser", "Documents"),
          createTab("chat-rail", "ChatRail", "Assistant"),
        ]),
      ], [33, 34, 33]),
    ], [50, 50]),
    panelStates: {},
    collapsedPanels: [],
    poppedOutPanels: [],
  };
}

export function getPreset(name: string): WorkspaceLayout {
  switch (name) {
    case "Classic": return getClassicLayout();
    case "Focus": return getFocusLayout();
    case "Ops": return getOpsLayout();
    case "Wall": return getWallLayout();
    default: return getClassicLayout();
  }
}

export const PRESET_NAMES = ["Classic", "Focus", "Ops", "Wall"] as const;
