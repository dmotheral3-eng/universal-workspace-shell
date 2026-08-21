import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceConfig } from "./types";

/**
 * WHICH PROFILE A BUILD SERVES.
 *
 * `VITE_PROFILE` is read once, at module load, so every case here re-imports
 * the module with the variable stubbed. That is not test ceremony — it is the
 * property under test: one build serves one profile, and nothing at runtime can
 * change it. A deployment that wants a different surface is a different build.
 */
async function configFor(profile: string | undefined): Promise<WorkspaceConfig> {
  vi.resetModules();
  if (profile === undefined) vi.stubEnv("VITE_PROFILE", "");
  else vi.stubEnv("VITE_PROFILE", profile);
  const mod = await import("./index");
  return mod.getConfig();
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("profile selection", () => {
  it("serves the lending surface on lending-app", async () => {
    const c = await configFor("lending-app");
    expect(c.brand.name).toBe("Centripetal Lending");
    expect(c.vocabulary.entity).toBe("Book");
    expect(c.vocabulary.entityPlural).toBe("Books");
    expect(c.data.mode).toBe("cube-broker");
    expect(c.defaultLayout).toBe("LendingClassic");
  });

  it("gives the lending surface exactly its own panels and none of the legal ones", async () => {
    const c = await configFor("lending-app");
    expect([...c.panels].sort()).toEqual([
      "Attestations",
      "Books",
      "Changes",
      "Decisions",
      "Interactions",
    ]);
  });

  it("leaves Law Dog untouched", async () => {
    const c = await configFor("lawdog");
    expect(c.brand.name).toBe("Law Dog");
    expect(c.data.mode).toBe("lawdog-cube");
    expect(c.panels).not.toContain("Books");
  });

  it("leaves the cube proof surface untouched", async () => {
    const c = await configFor("cube");
    expect(c.data.mode).toBe("cube-broker");
    expect(c.panels).toEqual(["Rates"]);
  });

  it("still falls back to the mock workspace when nothing is set", async () => {
    const c = await configFor(undefined);
    expect(c.data.mode).toBe("mock");
    expect(c.panels).not.toContain("Books");
  });

  it("falls back to the mock workspace for a profile nobody defined", async () => {
    const c = await configFor("not-a-profile");
    expect(c.data.mode).toBe("mock");
  });

  it("gives the lending surface a door — it is not a no-auth surface", async () => {
    const mod = await (async () => {
      vi.resetModules();
      vi.stubEnv("VITE_PROFILE", "lending-app");
      return import("./index");
    })();
    expect(mod.getAuthConfig()).not.toBeNull();
  });
});
