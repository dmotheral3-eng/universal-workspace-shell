import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * D-MSDOOR-2: a brokered door must never be handed another vertical's fixtures.
 *
 * The live defect: lending-app.centripetal-ai.com shipped MockProvider's MEDICAL
 * fixtures (patients with DOB and MRN) into the lending door, because provider
 * selection fell through to MockProvider for every mode that was not "lawdog".
 * Dave saw patient cards beside lending Ask suggestions on 2026-08-24.
 */

let mode = "cube-broker";

vi.mock("@/config", () => ({
  getConfig: () => ({ data: { mode, broker: {} } }),
}));

async function freshProvider() {
  vi.resetModules();
  const mod = await import("./index");
  return mod.getDataProvider();
}

beforeEach(() => {
  mode = "cube-broker";
});

describe("getDataProvider", () => {
  it("gives a brokered profile NO entities rather than the medical mock", async () => {
    const p = await freshProvider();
    await expect(p.listEntities()).resolves.toEqual([]);
    await expect(p.listDocuments()).resolves.toEqual([]);
    await expect(p.getDocument("any-doc-id")).resolves.toBeNull();
  });

  it("never leaks a medical fixture into a brokered door", async () => {
    const p = await freshProvider();
    const entities = await p.listEntities();
    const blob = JSON.stringify(entities);
    expect(blob).not.toMatch(/MRN/i);
    expect(blob).not.toMatch(/DOB/i);
    expect(entities).toHaveLength(0);
  });

  it("still gives an explicitly mock profile the mock data", async () => {
    mode = "mock";
    const p = await freshProvider();
    const entities = await p.listEntities();
    expect(entities.length).toBeGreaterThan(0);
  });
});
