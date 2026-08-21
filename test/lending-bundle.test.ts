import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * DOES THE LENDING BUILD ACTUALLY CARRY THE LENDING PANELS?
 *
 * This exists because of a specific failure, not as a formality. A panel is
 * only reachable if it is registered in every `Record<PanelType, …>` map the
 * shell keeps; miss one and `tsc -b` fails, the hosting build serves the
 * PREVIOUS bundle, and the deploy reports green while the surface is unchanged.
 * A test that reads the emitted bytes is the only thing that catches the second
 * half of that.
 *
 * The control is the same shape as test/bundle-secrets.ts: assert something
 * that MUST be present alongside something that MUST be absent, so a grep
 * pointed at nothing cannot pass.
 */

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "dist-lending-test");

const CUBE_KEY_SENTINEL = "SENTINEL-LENDING-CUBE-KEY-7f3a";

let js = "";
let fileCount = 0;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

beforeAll(() => {
  rmSync(OUT, { recursive: true, force: true });

  execFileSync(
    process.execPath,
    [path.join(ROOT, "node_modules/vite/bin/vite.js"), "build", "--outDir", "dist-lending-test", "--emptyOutDir"],
    {
      cwd: ROOT,
      stdio: "pipe",
      env: {
        ...process.env,
        VITE_PROFILE: "lending-app",
        VITE_MASTER_URL: "https://sentinel-master-host.supabase.co",
        VITE_MASTER_ANON_KEY: "SENTINEL-MASTER-ANON-LENDING",
        // Server-only, present on purpose: a VITE_ slip or a stray import of
        // server/ would drag this into dist and the absence check would fail.
        CUBE_URL: "https://sentinel-cube-host.supabase.co",
        CUBE_BROKER_KEY: CUBE_KEY_SENTINEL,
        MASTER_URL: "https://sentinel-master-host.supabase.co",
        MASTER_ANON_KEY: "SENTINEL-MASTER-ANON-LENDING",
      },
    }
  );

  const files = walk(OUT).filter((f) => f.endsWith(".js"));
  fileCount = files.length;
  js = files.map((f) => readFileSync(f, "utf8")).join("\n");
}, 180_000);

afterAll(() => {
  rmSync(OUT, { recursive: true, force: true });
});

describe("the lending build serves the lending surface", () => {
  it("built something to look at", () => {
    expect(fileCount).toBeGreaterThan(0);
    expect(js.length).toBeGreaterThan(1000);
  });

  it("carries all five lending panels — the check that a missing registry key would fail", () => {
    // Panel-body strings, not config strings: the config JSON is statically
    // imported by every profile, so its words prove nothing about registration.
    for (const marker of [
      "No books are open to you in this workspace.",
      "No decisions recorded for this book.",
      "No interactions recorded for this book.",
      "No changes recorded for this book.",
      "No attestations recorded for this book.",
      "corrects an earlier record",
    ]) {
      expect(js, `bundle is missing: ${marker}`).toContain(marker);
    }
  });

  it("names its brokered resources and no Cube table", () => {
    for (const resource of [
      "lending_books",
      "lending_decisions",
      "lending_interactions",
      "lending_changes",
      "lending_attestations",
    ]) {
      expect(js).toContain(resource);
    }
    // The browser is told a resource name. It is never told a table name.
    for (const table of ["evidence_decisions", "evidence_interactions", "evidence_attestations"]) {
      expect(js, `client bundle names the Cube table ${table}`).not.toContain(table);
    }
  });

  it("carries no Cube credential and no Cube hostname", () => {
    expect(js).not.toContain(CUBE_KEY_SENTINEL);
    expect(js).not.toContain("sentinel-cube-host");
  });

  it("inlines the public master anon key — the control that proves this grep works", () => {
    expect(js).toContain("SENTINEL-MASTER-ANON-LENDING");
  });
});
