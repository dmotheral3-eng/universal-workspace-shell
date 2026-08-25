/**
 * D-BWSHELL-1 — one shell bundle was shipping every client profile to every
 * client door, and the demo door's browser tab read "Workspace Shell".
 *
 * FOUND LIVE 2026-08-25 on the deployed BorrowWorks door: the single served
 * bundle carried the panel code of profiles that door does not use — including
 * the 268 kB legal recovery-outlook panel — so anyone viewing source at one
 * client's door could read another profile's material. Specimen content, not
 * client records, but an incomplete separation is still a separation nobody
 * should have to trust.
 *
 * WHY IT LEAKED. VITE_PROFILE is inlined at build time and .env.example is
 * explicit that "one deployment serves exactly one profile" — but
 * src/registry/index.tsx imported all 25 panel components STATICALLY and then
 * chose between them in a runtime map. A build-time constant selected by a
 * runtime lookup over static imports cannot tree-shake, so every door got
 * every panel.
 *
 * THE FIX, and why it needs no new hand-maintained list: every profile config
 * already declares its own `panels` array. This plugin reads the ACTIVE
 * profile's array and emits a virtual module importing only those panels.
 * Foreign panels are never in the module graph, so they are not in dist at
 * all — not as a chunk, not behind a guessable filename. Build-time exclusion,
 * not lazy loading.
 *
 * PanelType -> module/export lives in src/registry/panel-manifest.json, which
 * was generated mechanically from the registry it replaces rather than retyped.
 * A panel added to a config but missing from the manifest FAILS THE BUILD; a
 * silent empty panel is exactly the kind of quiet breakage this repo's own
 * no-reveal and noindex plugins exist to prevent.
 *
 * It also sets <title> per profile from that config's brand.name. A prospect's
 * browser tab should say BorrowWorks, never the generic internal shell name.
 */

import fs from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";

const VIRTUAL_ID = "virtual:panel-registry";
const RESOLVED_ID = "\0" + VIRTUAL_ID;

/**
 * The active profile's config, resolved at build time. src/config/index.ts used
 * to import all six config JSONs statically and pick one in a runtime switch,
 * which inlined every client's brand, vocabulary and suggested questions into
 * every door's bundle.
 */
const VIRTUAL_CONFIG_ID = "virtual:profile-config";
const RESOLVED_CONFIG_ID = "\0" + VIRTUAL_CONFIG_ID;

/** The internal shell name that must never reach a client tab. */
const GENERIC_TITLE = "Workspace Shell";

type ManifestEntry = { module: string; export: string };

/** Unset/blank profile falls back to `workspace`, matching src/config/index.ts. */
function activeProfile(): string {
  const p = process.env.VITE_PROFILE;
  return p && p.trim() ? p.trim() : "workspace";
}

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
}

/**
 * panels.html is the LEGAL PANELS FIXTURE HARNESS (src/panels-preview.tsx). It
 * statically imports every legal panel view, so including it as a rollup input
 * pulls all of that code into any build — and it is then SERVED: verified live
 * 2026-08-25, https://lending-app.centripetal-ai.com/panels.html returned 200
 * titled "Legal panels - fixture harness" at a BorrowWorks client door.
 *
 * Safe-by-default, the same posture as publicSurfaceGatePlugin: the fixture is
 * built ONLY for the lawdog profile that owns those panels, or when someone
 * asks for it explicitly with VITE_INCLUDE_FIXTURES=true. A missing variable
 * must never publish a fixture page onto a client door.
 */
export function includeFixtureEntry(): boolean {
  if (process.env.VITE_INCLUDE_FIXTURES === "true") return true;
  return activeProfile() === "lawdog";
}

export function profileBundlePlugin(root = process.cwd()): Plugin {
  const profile = activeProfile();
  const configFile = path.resolve(root, "src/config", `${profile}.config.json`);
  const manifestFile = path.resolve(root, "src/registry/panel-manifest.json");

  return {
    name: "profile-bundle",

    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_ID;
      if (id === VIRTUAL_CONFIG_ID) return RESOLVED_CONFIG_ID;
      return null;
    },

    load(id) {
      if (id === RESOLVED_CONFIG_ID) {
        if (!fs.existsSync(configFile)) {
          this.error(
            `profile-bundle: VITE_PROFILE="${profile}" has no ${path.relative(root, configFile)}.`,
          );
        }
        return [
          `// GENERATED for VITE_PROFILE="${profile}" — only this profile's config is bundled.`,
          `export default ${fs.readFileSync(configFile, "utf8").trim()};`,
          ``,
        ].join("\n");
      }
      if (id !== RESOLVED_ID) return null;

      if (!fs.existsSync(configFile)) {
        this.error(
          `profile-bundle: VITE_PROFILE="${profile}" but ${path.relative(root, configFile)} does not exist. ` +
            `Add the config or correct the profile — refusing to emit an empty panel registry.`,
        );
      }

      const manifest = readJson<Record<string, ManifestEntry>>(manifestFile);
      const panels = readJson<{ panels?: string[] }>(configFile).panels ?? [];

      const unknown = panels.filter((p) => !manifest[p]);
      if (unknown.length) {
        this.error(
          `profile-bundle: profile "${profile}" declares panel(s) ${unknown.join(", ")} ` +
            `with no entry in src/registry/panel-manifest.json. Add them there, or the panel renders as nothing at runtime.`,
        );
      }

      // Deduplicate: a config may legitimately list a panel twice across layouts.
      const wanted = [...new Set(panels)];

      const lines = wanted.map(
        (p, i) => `import { ${manifest[p].export} as P${i} } from "${manifest[p].module}";`,
      );
      const entries = wanted.map((p, i) => `  ${JSON.stringify(p)}: P${i},`);

      return [
        `// GENERATED by build-plugins/profile-bundle-plugin.ts for VITE_PROFILE="${profile}".`,
        `// Only this profile's panels are imported, so no other profile's code enters the bundle.`,
        ...lines,
        `export const panelMap = {`,
        ...entries,
        `};`,
        ``,
      ].join("\n");
    },

    transformIndexHtml(html) {
      if (!fs.existsSync(configFile)) return html;
      const brand = readJson<{ brand?: { name?: string } }>(configFile).brand?.name;
      if (!brand) return html;
      const safe = brand.replace(/[<>]/g, "");
      // Substitute the generic shell name INSIDE the title rather than replacing
      // the whole tag, so popout.html keeps its "Panel — " prefix and becomes
      // "Panel — BorrowWorks" instead of losing the qualifier entirely.
      return html.replace(/<title>([\s\S]*?)<\/title>/, (_m, inner: string) => {
        const replaced = inner.includes(GENERIC_TITLE)
          ? inner.split(GENERIC_TITLE).join(safe)
          : safe;
        return `<title>${replaced}</title>`;
      });
    },
  };
}
