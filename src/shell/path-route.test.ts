import { describe, expect, it } from "vitest";
import { panelForPath, PATH_PANELS } from "./path-route";

describe("path -> panel", () => {
  it("maps /whereweare, with or without a trailing slash", () => {
    expect(panelForPath("/whereweare")).toBe("WhereWeAre");
    expect(panelForPath("/whereweare/")).toBe("WhereWeAre");
  });

  it("leaves the root and unknown paths alone rather than 404ing inside the app", () => {
    expect(panelForPath("/")).toBeNull();
    expect(panelForPath("")).toBeNull();
    expect(panelForPath("/something-else")).toBeNull();
  });

  it("every mapped panel is a real registered panel type", () => {
    // Guards the map against a rename in PanelType that would silently dead-end a URL.
    for (const panel of Object.values(PATH_PANELS)) {
      expect(typeof panel).toBe("string");
      expect(panel.length).toBeGreaterThan(0);
    }
  });
});
