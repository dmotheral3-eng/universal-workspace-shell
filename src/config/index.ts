import type { AuthConfig, WorkspaceConfig } from "./types";
import lawdogJson from "./lawdog.config.json";
import workspaceJson from "./workspace.config.json";
import cubeJson from "./cube.config.json";
import lendingJson from "./lending-app.config.json";
import borrowworksJson from "./borrowworks.config.json";
import inboxJson from "./inbox.config.json";

export type { WorkspaceConfig, BrandConfig, VocabularyConfig, AuthConfig, PanelType } from "./types";

/**
 * Selects ONE of the six profile JSON files.
 *
 * D-BWSHELL-1 (2026-08-25): this used to be `pickProfile(profile: string |
 * undefined)`, called as `pickProfile(import.meta.env.VITE_PROFILE)`. That
 * one extra hop through a function PARAMETER is enough to defeat the build's
 * dead-code elimination — `import.meta.env.VITE_PROFILE` is inlined to a
 * string literal by Vite at every place it is textually written, but esbuild
 * does not inline arbitrary function calls to fold a literal through a
 * parameter into the branches of a `switch` in a different function. The
 * six imports above are static, so all six stayed in the bundle regardless
 * of which branch ran, and every deployed door shipped every other door's
 * config JSON — confirmed live: a `VITE_PROFILE=borrowworks` build still
 * contained the Law Dog profile's demo case id.
 *
 * The fix is not a second build system or dynamic `import()` (`getConfig()`
 * is called synchronously all over this app; making profile selection async
 * would be the refactor this dispatch was told to avoid unless the smaller
 * fix does not work). It is comparing `import.meta.env.VITE_PROFILE`
 * directly, inline, at each branch, with no parameter in between — the same
 * shape `App.tsx` already uses for its own `VITE_PROFILE === "borrowworks"`
 * check, which esbuild DOES fold. Once each branch is a literal-vs-literal
 * comparison, the false branches — and the now-unused imports they were the
 * only reference to — are eliminated. Verified: `test/bundle-secrets.test.ts`
 * pattern (grep the built bundle) shows the other profiles' JSON no longer
 * present in a single-profile build; `src/config/profile.test.ts` (behavior)
 * is unchanged and still green.
 */
function pickProfile(): WorkspaceConfig {
  if (import.meta.env.VITE_PROFILE === "lawdog") return lawdogJson as WorkspaceConfig;
  // Cube-backed surfaces: master is the door, /api/cube/* is the data path.
  if (import.meta.env.VITE_PROFILE === "cube") return cubeJson as WorkspaceConfig;
  // The lending surface. Same door and same data path as `cube`; a separate
  // profile because VITE_PROFILE is inlined at build time, so one deployment
  // serves exactly one of these — see .env.example.
  if (import.meta.env.VITE_PROFILE === "lending-app") return lendingJson as WorkspaceConfig;
  // The BorrowWorks operator desk. Same door and same data path as `lending-app`;
  // a separate profile because it renders the two-register surface rather than
  // the panel workspace, and VITE_PROFILE is inlined at build time.
  if (import.meta.env.VITE_PROFILE === "borrowworks") return borrowworksJson as WorkspaceConfig;
  // Dave's own operator inbox. Master is the door; the data path is
  // /api/inbox rather than the Cube broker, because every source it reads
  // lives on master (D-INBOX-1). A separate profile because VITE_PROFILE is
  // inlined at build time, so one deployment serves exactly one of these.
  if (import.meta.env.VITE_PROFILE === "inbox") return inboxJson as WorkspaceConfig;
  return workspaceJson as WorkspaceConfig;
}

const config: WorkspaceConfig = pickProfile();

if (config.data.lawdog) {
  config.data.lawdog.anonKey = import.meta.env.VITE_LAWDOG_ANON_KEY ?? "";
}

// Master door. Both values are public — an anon key is what accompanies a user's
// own JWT — but they are still env, not committed JSON. The Cube's URL and key
// are NOT here and must never be: they are server-only (server/broker/env.ts).
if (config.auth) {
  config.auth.url = import.meta.env.VITE_MASTER_URL ?? "";
  config.auth.anonKey = import.meta.env.VITE_MASTER_ANON_KEY ?? "";
}

export function getConfig(): WorkspaceConfig {
  return config;
}

/**
 * The door this profile signs in through, or null for a profile that has none.
 * The Law Dog profile keeps its own door (native auth on its own project); the
 * cube profile uses master. One gate serves both — see src/shell/lawdog-gate.tsx.
 */
export function getAuthConfig(): AuthConfig | null {
  if (config.auth) return config.auth;
  if (config.data.mode.startsWith("lawdog") && config.data.lawdog) {
    return {
      url: config.data.lawdog.url,
      anonKey: config.data.lawdog.anonKey,
      label: config.brand.name,
    };
  }
  return null;
}

export function getVocabulary() {
  return config.vocabulary;
}

export function getBrand() {
  return config.brand;
}
