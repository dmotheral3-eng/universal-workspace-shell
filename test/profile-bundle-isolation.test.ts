import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * D-BWSHELL-1 (2026-08-25) — one shell bundle ships every client profile to
 * every client door.
 *
 * `src/config/index.ts` picks ONE of six profile JSON files by `VITE_PROFILE`,
 * a build-time-inlined env var — the architecture's own stated intent
 * (.env.example: "one deployment serves exactly one profile"). Root cause of
 * the leak: the six imports are static and `pickProfile` used to take the
 * resolved profile as a function PARAMETER, which is one hop too many for
 * esbuild's dead-code elimination — it folds `import.meta.env.VITE_PROFILE`
 * to a literal at every direct textual occurrence, but not through a
 * parameter into a switch in a different function. So all six configs
 * — including real per-tenant fields the other profiles set (a case id, an
 * anon-key env name) — rode along in every build regardless of which branch
 * ran, readable via view-source at any deployed door.
 *
 * This test builds the client the same way `test/bundle-secrets.test.ts`
 * proves credentials don't leak — a real build, real env, real grep of the
 * bytes that would ship — because dist/ is the only honest place to check a
 * build-time-inlining claim. Two directions, so a grep that never looked at
 * anything (or a config file that got deleted) can't pass silently:
 *   - a `borrowworks` build must NOT carry `lawdog.config.json`'s marker
 *   - the same build MUST carry its own profile's marker (the control)
 */

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "dist-profile-isolation-test");

// Unique to src/config/lawdog.config.json — confirmed via `grep -rl` across
// src/ before writing this test. Not the case id in src/data/lawdog-fixtures.ts,
// which is a separate, intentional fixture constant for the unrelated
// /panels.html preview harness and coincidentally shares a value.
const LAWDOG_ONLY_MARKER = "SET_VITE_LAWDOG_ANON_KEY";

// Unique to src/config/lending-app.config.json / borrowworks.config.json
// (defaultLayout), present only when one of those profiles is selected.
const BORROWWORKS_PROFILE_MARKER = "LendingClassic";

let files: Array<{ path: string; text: string }> = [];

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
    [path.join(ROOT, "node_modules/vite/bin/vite.js"), "build", "--outDir", "dist-profile-isolation-test", "--emptyOutDir"],
    {
      cwd: ROOT,
      stdio: "pipe",
      env: { ...process.env, VITE_PROFILE: "borrowworks" },
    },
  );

  // Only the app's own entries — /panels.html is a deliberate, unrelated fixture
  // harness (src/panels-preview.tsx) that imports lawdog panel components
  // directly for preview purposes regardless of VITE_PROFILE; it is not part of
  // the profile-config leak this test guards and is excluded on purpose.
  files = walk(OUT)
    .filter((p) => p.endsWith(".js") && !p.includes(`${path.sep}panels-`))
    .map((p) => ({ path: path.relative(ROOT, p), text: readFileSync(p, "utf8") }));
}, 180_000);

afterAll(() => {
  rmSync(OUT, { recursive: true, force: true });
});

describe("D-BWSHELL-1: a single-profile build ships only its own profile", () => {
  it("built something to look at", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it("carries its own profile's config — the control that proves this grep works", () => {
    const hit = files.find((f) => f.text.includes(BORROWWORKS_PROFILE_MARKER));
    expect(hit, "expected the borrowworks profile's own marker somewhere in the app bundle").toBeTruthy();
  });

  it("does not carry another profile's config JSON", () => {
    const hit = files.find((f) => f.text.includes(LAWDOG_ONLY_MARKER));
    expect(hit?.path, "lawdog.config.json leaked into a borrowworks build").toBeUndefined();
  });
});
