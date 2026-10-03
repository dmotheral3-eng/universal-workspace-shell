import { describe, expect, it } from "vitest";
import { PANEL_META, RAIL_ORDER } from "./nav-rail";
import manifest from "@/registry/panel-manifest.json";

/**
 * BOR-139 REGRESSION — the signed-in lending app rendered a blank white page.
 *
 * The lending-app profile registered a "Vendors" panel (D-BWVENDOR-1). The panel
 * manifest knew it; `PANEL_META` did not; and `PanelType` did not list it, so
 * the `Record<PanelType, …>` type on PANEL_META could not notice the hole. The
 * Semester face built its rail with `PANEL_META[pt].label`, that threw on
 * `undefined`, React unmounted the tree, and every signed-in user saw white.
 * Signed out, the gate renders before the face, so nothing looked wrong.
 *
 * The type system cannot see a panel named only in JSON, so this test reads the
 * JSON: every panel any profile registers, and every panel the manifest can
 * build, must have a rail entry.
 */

const profiles = import.meta.glob<{ panels?: string[] }>("../config/*.config.json", {
  eager: true,
  import: "default",
});

const meta = PANEL_META as Record<string, { label?: string } | undefined>;

describe("every registered panel has a rail entry", () => {
  it("reads every profile config", () => {
    expect(Object.keys(profiles).length).toBeGreaterThan(0);
    expect(Object.keys(profiles).some((f) => f.endsWith("lending-app.config.json"))).toBe(true);
  });

  it("covers every panel every profile registers", () => {
    const missing = Object.entries(profiles).flatMap(([file, json]) =>
      (json.panels ?? []).filter((panel) => !meta[panel]?.label).map((panel) => `${file}: ${panel}`)
    );
    expect(missing).toEqual([]);
  });

  it("covers every panel the manifest can build", () => {
    const panels = Object.keys(manifest).filter((k) => !k.startsWith("$") && !k.startsWith("_"));
    expect(panels.filter((panel) => !meta[panel]?.label)).toEqual([]);
  });

  it("names Vendors, which is the entry whose absence blanked the app", () => {
    expect(meta.Vendors?.label).toBe("Vendors");
    expect(RAIL_ORDER).toContain("Vendors");
  });
});
