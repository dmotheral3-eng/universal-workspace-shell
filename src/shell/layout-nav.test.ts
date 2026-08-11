import { describe, expect, it } from "vitest";
import { createLeaf, createSplit, createTab, resolvePanelTarget, setActiveTabIndex } from "./layout-tree";
import type { WorkspaceLayout } from "./layout-tree";

/**
 * D-LDNAV-1 REGRESSION.
 *
 * The Matter home cards were dead links. Not because they had no handler — they
 * had one — but because the handler asked "is this panel present anywhere in the
 * tree?" and gave up when the answer was yes. In the Classic layout Evidence and
 * the Timeline are BACKGROUND TABS beside Matter home, so "present" was always
 * true and "Open the evidence →" did nothing, forever.
 *
 * These tests pin the distinction that fix rests on: present ≠ on screen.
 */

/** The shape Dave was looking at: one leaf, four tabs, Matter home in front. */
function classicish(): WorkspaceLayout {
  return {
    root: createSplit("root", "horizontal", [
      createLeaf("left", [createTab("entity-list", "EntityList", "Matters")]),
      createLeaf("center", [
        createTab("matter-home", "MatterHome", "Matter home"),
        createTab("doc-browser", "DocBrowser", "Evidence"),
        createTab("item-table", "ItemTable", "Timeline"),
        createTab("reading-pane", "ReadingPane", "Reading Pane"),
      ]),
    ]),
    panelStates: {},
    collapsedPanels: [createTab("stage-tracker", "StageTracker", "Stages")],
    poppedOutPanels: [],
  };
}

describe("resolvePanelTarget", () => {
  it("raises a background tab instead of treating it as already handled", () => {
    // The whole defect in one assertion.
    expect(resolvePanelTarget(classicish(), "DocBrowser")).toEqual({
      kind: "raise",
      leafId: "center",
      tabIndex: 1,
    });
    expect(resolvePanelTarget(classicish(), "ItemTable")).toEqual({
      kind: "raise",
      leafId: "center",
      tabIndex: 2,
    });
  });

  it("raises the panel that is already in front, rather than opening a second one", () => {
    expect(resolvePanelTarget(classicish(), "MatterHome")).toEqual({
      kind: "raise",
      leafId: "center",
      tabIndex: 0,
    });
  });

  it("finds panels in any leaf, not just the first", () => {
    expect(resolvePanelTarget(classicish(), "EntityList")).toEqual({
      kind: "raise",
      leafId: "left",
      tabIndex: 0,
    });
  });

  it("restores a collapsed panel rather than mounting a duplicate", () => {
    const target = resolvePanelTarget(classicish(), "StageTracker");
    expect(target.kind).toBe("restore");
    if (target.kind === "restore") expect(target.tab.panelType).toBe("StageTracker");
  });

  it("mounts a panel that is nowhere at all", () => {
    // Every "Open the X →" card whose panel this profile has never opened.
    for (const panel of ["Parties", "Subpoenas", "ClaimValue", "RecoveryOutlook", "CoverageMatrix", "ChatRail"] as const) {
      expect(resolvePanelTarget(classicish(), panel)).toEqual({ kind: "mount" });
    }
  });
});

describe("setActiveTabIndex", () => {
  it("switches the active tab of the named leaf and leaves the rest alone", () => {
    const root = setActiveTabIndex(classicish().root, "center", 2);
    const center = root.type === "split" ? root.children[1] : root;
    const left = root.type === "split" ? root.children[0] : root;
    expect(center.type === "leaf" && center.activeTabIndex).toBe(2);
    expect(left.type === "leaf" && left.activeTabIndex).toBe(0);
  });

  it("does not touch a leaf it was not asked about", () => {
    const before = classicish().root;
    const after = setActiveTabIndex(before, "no-such-leaf", 3);
    expect(after).toEqual(before);
  });
});
