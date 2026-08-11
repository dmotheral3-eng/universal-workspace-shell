import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Bundle grep — the claim this test defends is "no Cube credential is in the
 * client bundle", and the only honest way to check it is to build the client
 * with a Cube credential present in the environment and then read every byte
 * that came out.
 *
 * The build runs with sentinel values in BOTH kinds of variable:
 *
 *   CUBE_BROKER_KEY / CUBE_URL   server-only — must be ABSENT from dist
 *   VITE_MASTER_ANON_KEY         client-side by design — must be PRESENT
 *
 * The second assertion is the control. Without it this test could pass simply
 * because the grep never looked at anything, or because Vite stopped inlining
 * env at all — a green test that proved nothing. Requiring the public value to
 * show up proves the grep is pointed at real, env-substituted output.
 */

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "dist-bundle-test");

const CUBE_KEY_SENTINEL = "SENTINEL-CUBE-KEY-9c1f4a2b7e";
const CUBE_URL_SENTINEL = "https://sentinel-cube-host-4d8e.supabase.co";
const MASTER_ANON_SENTINEL = "SENTINEL-MASTER-ANON-3b7c";

let files: Array<{ path: string; text: string }> = [];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

beforeAll(() => {
  rmSync(OUT, { recursive: true, force: true });

  execFileSync(process.execPath, [
    path.join(ROOT, "node_modules/vite/bin/vite.js"),
    "build",
    "--outDir",
    "dist-bundle-test",
    "--emptyOutDir",
  ], {
    cwd: ROOT,
    stdio: "pipe",
    env: {
      ...process.env,
      // The profile that actually uses the broker.
      VITE_PROFILE: "cube",
      VITE_MASTER_URL: "https://sentinel-master-host.supabase.co",
      VITE_MASTER_ANON_KEY: MASTER_ANON_SENTINEL,
      // Server-only. Present in the build environment ON PURPOSE — that is the
      // whole point: a `VITE_`-prefixed slip, or a stray import of server/,
      // would drag these into dist and this test would catch it.
      CUBE_URL: CUBE_URL_SENTINEL,
      CUBE_BROKER_KEY: CUBE_KEY_SENTINEL,
      MASTER_URL: "https://sentinel-master-host.supabase.co",
      MASTER_ANON_KEY: MASTER_ANON_SENTINEL,
    },
  });

  files = walk(OUT).map((p) => ({ path: path.relative(ROOT, p), text: readFileSync(p, "utf8") }));
}, 180_000);

afterAll(() => {
  rmSync(OUT, { recursive: true, force: true });
});

describe("(c) no Cube credential reaches the client bundle", () => {
  it("built something to look at", () => {
    expect(files.length).toBeGreaterThan(0);
    expect(files.some((f) => f.path.endsWith(".js"))).toBe(true);
  });

  it("inlines the public master anon key — the control that proves this grep works", () => {
    expect(files.some((f) => f.text.includes(MASTER_ANON_SENTINEL))).toBe(true);
  });

  it("contains no Cube credential", () => {
    const hits = files.filter((f) => f.text.includes(CUBE_KEY_SENTINEL)).map((f) => f.path);
    expect(hits).toEqual([]);
  });

  it("contains no Cube project URL", () => {
    const hits = files.filter((f) => f.text.includes(CUBE_URL_SENTINEL)).map((f) => f.path);
    expect(hits).toEqual([]);
  });

  it("names no server-only variable and no service_role key", () => {
    for (const needle of ["CUBE_BROKER_KEY", "SHELL_MEMBERSHIP_TABLE", "service_role"]) {
      const hits = files.filter((f) => f.text.includes(needle)).map((f) => f.path);
      expect(hits, needle).toEqual([]);
    }
  });

  it("does not drag the broker's server code into the bundle", () => {
    // String literals, not identifiers: a minifier renames `handleCubeRequest`,
    // so an identifier needle could pass on a bundle that really did include it.
    //
    // Table names are NOT a needle here. The native Law Dog provider names its
    // own tables client-side and always has — that is the native door, which
    // this change does not touch. What must not appear is the broker's own
    // vocabulary, because that only exists server-side.
    for (const needle of ["tenant_bleed_blocked", "broker_misconfigured", "shell_tenant_members"]) {
      const hits = files.filter((f) => f.text.includes(needle)).map((f) => f.path);
      expect(hits, needle).toEqual([]);
    }
  });
});

describe("the client source cannot reach the server broker", () => {
  const sources = walk(path.join(ROOT, "src")).filter((p) => /\.(ts|tsx)$/.test(p));

  it("has no import from src/ into server/ or api/", () => {
    for (const file of sources) {
      const text = readFileSync(file, "utf8");
      expect(/from\s+["'][^"']*\/(server|api)\//.test(text), path.relative(ROOT, file)).toBe(false);
    }
  });

  it("mentions no server-only env var anywhere under src/", () => {
    for (const file of sources) {
      const text = readFileSync(file, "utf8");
      for (const needle of ["CUBE_BROKER_KEY", "CUBE_URL", "service_role"]) {
        expect(text.includes(needle), `${path.relative(ROOT, file)} mentions ${needle}`).toBe(false);
      }
    }
  });
});
