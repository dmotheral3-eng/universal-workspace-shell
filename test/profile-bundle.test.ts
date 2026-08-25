import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

/**
 * D-BWSHELL-1 — one door must download only its own profile.
 *
 * FOUND LIVE 2026-08-25 on the deployed BorrowWorks door: the single served
 * bundle carried other profiles' panel code, and /panels.html — the LEGAL
 * PANELS FIXTURE HARNESS — answered 200 at that client's domain.
 *
 * THIS TEST BUILDS FOR REAL, because nothing else can prove it. The unit tests
 * in src/config/profile.test.ts exercise the dev/test modules
 * (src/config/profile-config.ts, src/registry/panel-map.ts), which deliberately
 * still hold every profile so `vite dev` and vitest can select any of them.
 * What SHIPS is produced by build-plugins/profile-bundle-plugin.ts substituting
 * `virtual:profile-config` and `virtual:panel-registry`. Only build output can
 * show which of those two paths a user actually receives.
 *
 * The lawdog case is the CONTROL. Without it this test could pass because the
 * grep matched nothing, or because the build silently emitted no panels at all —
 * a green test proving nothing. Requiring the owning profile to CONTAIN the same
 * markers proves the grep is pointed at real output and that the fix removed
 * code by profile rather than removing it everywhere.
 */

const ROOT = path.resolve(import.meta.dirname, "..");

/** User-visible copy that exists only inside a legal panel implementation. */
const LEGAL_PANEL_COPY = "No subpoenas recorded.";
/** User-visible copy that exists only inside a lending panel implementation. */
const LENDING_PANEL_COPY = "Books";

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const outputs = new Map<string, { js: string; indexHtml: string; hasFixture: boolean }>();

function build(profile: string) {
  const cached = outputs.get(profile);
  if (cached) return cached;

  const out = `dist-profile-test-${profile}`;
  const abs = path.join(ROOT, out);
  rmSync(abs, { recursive: true, force: true });

  execFileSync(
    process.execPath,
    [path.join(ROOT, "node_modules/vite/bin/vite.js"), "build", "--outDir", out, "--emptyOutDir"],
    {
      cwd: ROOT,
      stdio: "pipe",
      env: {
        ...process.env,
        VITE_PROFILE: profile,
        VITE_MASTER_URL: "https://sentinel-master-host.supabase.co",
        VITE_MASTER_ANON_KEY: "SENTINEL-MASTER-ANON",
      },
    },
  );

  const files = walk(abs);
  const result = {
    js: files
      .filter((f) => f.endsWith(".js"))
      .map((f) => readFileSync(f, "utf8"))
      .join("\n"),
    indexHtml: readFileSync(path.join(abs, "index.html"), "utf8"),
    hasFixture: existsSync(path.join(abs, "panels.html")),
  };
  outputs.set(profile, result);
  return result;
}

afterAll(() => {
  for (const profile of outputs.keys()) {
    rmSync(path.join(ROOT, `dist-profile-test-${profile}`), { recursive: true, force: true });
  }
});

describe("a door downloads only its own profile", () => {
  it("keeps another profile's panel code out of the lending door", () => {
    expect(build("lending-app").js).not.toContain(LEGAL_PANEL_COPY);
  }, 180_000);

  it("CONTROL — the profile that owns those panels still ships them", () => {
    expect(build("lawdog").js).toContain(LEGAL_PANEL_COPY);
  }, 180_000);

  it("still ships the lending door its own panels", () => {
    expect(build("lending-app").js).toContain(LENDING_PANEL_COPY);
  }, 180_000);

  it("does not serve the legal fixture harness from a client door", () => {
    expect(build("lending-app").hasFixture).toBe(false);
  }, 180_000);

  it("CONTROL — the fixture is still built for the profile that owns it", () => {
    expect(build("lawdog").hasFixture).toBe(true);
  }, 180_000);

  it("never puts the internal shell name in a client's browser tab", () => {
    expect(build("lending-app").indexHtml).toContain("<title>BorrowWorks</title>");
    expect(build("lending-app").indexHtml).not.toContain("Workspace Shell");
  }, 180_000);

  it("CONTROL — the title is per-profile, not hardcoded to one brand", () => {
    expect(build("lawdog").indexHtml).toContain("<title>Law Dog</title>");
  }, 180_000);
});
