import type { WorkspaceLayout } from "./layout-tree";
import { createLeaf, createSplit, createTab } from "./layout-tree";
import { getConfig } from "@/config";

function v() {
  const vocab = getConfig().vocabulary;
  return vocab;
}

/**
 * The default layout, rebuilt for the explain-first idiom (D-LDUX-2).
 *
 * The centre column now LANDS on the entity's home screen rather than on a dense
 * table: orientation and cards first, the table one tab across. The Ask rail keeps
 * the full height of the right column so it stays the most visually present thing
 * on screen (D-LDUX-1).
 */
export function getClassicLayout(): WorkspaceLayout {
  const vocab = v();
  return {
    root: createSplit("root", "horizontal", [
      createLeaf("left", [createTab("entity-list", "EntityList", vocab.entityPlural)]),
      createSplit("center-right", "horizontal", [
        createLeaf("center", [
          createTab("matter-home", "MatterHome", `${vocab.entity} home`),
          createTab("doc-browser", "DocBrowser", "Evidence"),
          createTab("item-table", "ItemTable", vocab.itemPlural),
          createTab("reading-pane", "ReadingPane", "Reading Pane"),
          createTab("ledger", "Ledger", "Ledger"),
        ]),
        createLeaf("chat", [createTab("chat-rail", "ChatRail", "Ask")]),
      ], [68, 32]),
    ], [21, 79]),
    panelStates: {},
    collapsedPanels: [
      createTab("stage-tracker", "StageTracker", "Stages"),
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
      createTab("matter-home", "MatterHome", `${v().entity} home`),
      createTab("item-table", "ItemTable", v().itemPlural),
      createTab("chat-rail", "ChatRail", "Ask"),
      createTab("stage-tracker", "StageTracker", "Stages"),
      createTab("doc-browser", "DocBrowser", "Evidence"),
      createTab("metric-grid", "MetricGrid", "Metrics"),
      createTab("master-board", "MasterBoard", "Master Board"),
    ],
    poppedOutPanels: [],
  };
}

/**
 * GUIDED — the least dense arrangement in the set: the list, the home screen and
 * the Ask rail, and nothing else on screen. This is the one to hand somebody who
 * has never seen the workspace before.
 */
export function getGuidedLayout(): WorkspaceLayout {
  const vocab = v();
  return {
    root: createSplit("root", "horizontal", [
      createLeaf("guided-left", [createTab("entity-list", "EntityList", vocab.entityPlural)]),
      createLeaf("guided-center", [
        createTab("matter-home", "MatterHome", `${vocab.entity} home`),
        createTab("doc-browser", "DocBrowser", "Evidence"),
      ]),
      createLeaf("guided-chat", [createTab("chat-rail", "ChatRail", "Ask")]),
    ], [24, 50, 26]),
    panelStates: {},
    collapsedPanels: [
      createTab("item-table", "ItemTable", vocab.itemPlural),
      createTab("reading-pane", "ReadingPane", "Reading Pane"),
      createTab("stage-tracker", "StageTracker", "Stages"),
      createTab("metric-grid", "MetricGrid", "Metrics"),
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
          createTab("doc-browser", "DocBrowser", "Evidence"),
        ]),
        createLeaf("br", [
          createTab("metric-grid", "MetricGrid", "Metrics"),
          createTab("stage-tracker", "StageTracker", "Stages"),
          createTab("chat-rail", "ChatRail", "Ask"),
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
          createTab("doc-browser", "DocBrowser", "Evidence"),
          createTab("chat-rail", "ChatRail", "Ask"),
        ]),
      ], [33, 34, 33]),
    ], [50, 50]),
    panelStates: {},
    collapsedPanels: [],
    poppedOutPanels: [],
  };
}

/**
 * The cube profile's default: one panel, reached through the server broker.
 *
 * Deliberately not in PRESET_NAMES — it is not a general operator layout, it is
 * the proof surface for the brokered door, and every other preset opens panels
 * that profile has no data path for.
 */
export function getBrokerProofLayout(): WorkspaceLayout {
  return {
    root: createLeaf("broker-main", [createTab("rates", "Rates", "Rates")]),
    panelStates: {},
    collapsedPanels: [],
    poppedOutPanels: [],
  };
}

/**
 * LENDING — the book on the left, its evidence tabbed in the centre.
 *
 * Deliberately not in PRESET_NAMES, for the same reason BrokerProof is not:
 * every other preset opens panels the lending profile has no data path for, and
 * offering them would put "this panel is not available in this workspace" in
 * front of someone as a menu item.
 *
 * The four evidence panels all wait on a book, so the Books list is the only
 * thing on screen with anything to show until one is picked — which is why it
 * gets its own column rather than a tab.
 */
export function getLendingClassicLayout(): WorkspaceLayout {
  const vocab = v();
  return {
    root: createSplit("root", "horizontal", [
      createLeaf("lending-left", [createTab("books", "Books", vocab.entityPlural)]),
      createLeaf("lending-center", [
        createTab("decisions", "Decisions", "Decisions"),
        createTab("interactions", "Interactions", "Interactions"),
        createTab("changes", "Changes", "Changes"),
        createTab("attestations", "Attestations", "Attestations"),
      ]),
    ], [26, 74]),
    panelStates: {},
    collapsedPanels: [],
    poppedOutPanels: [],
  };
}

export function getPreset(name: string): WorkspaceLayout {
  switch (name) {
    case "Classic": return getClassicLayout();
    case "Guided": return getGuidedLayout();
    case "Focus": return getFocusLayout();
    case "Ops": return getOpsLayout();
    case "Wall": return getWallLayout();
    case "BrokerProof": return getBrokerProofLayout();
    case "LendingClassic": return getLendingClassicLayout();
    default: return getClassicLayout();
  }
}

export const PRESET_NAMES = ["Classic", "Guided", "Focus", "Ops", "Wall"] as const;
