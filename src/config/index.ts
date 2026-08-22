import type { AuthConfig, WorkspaceConfig } from "./types";
import lawdogJson from "./lawdog.config.json";
import workspaceJson from "./workspace.config.json";
import cubeJson from "./cube.config.json";
import lendingJson from "./lending-app.config.json";
import borrowworksJson from "./borrowworks.config.json";

export type { WorkspaceConfig, BrandConfig, VocabularyConfig, AuthConfig, PanelType } from "./types";

function pickProfile(profile: string | undefined): WorkspaceConfig {
  switch (profile) {
    case "lawdog":
      return lawdogJson as WorkspaceConfig;
    // Cube-backed surfaces: master is the door, /api/cube/* is the data path.
    case "cube":
      return cubeJson as WorkspaceConfig;
    // The lending surface. Same door and same data path as `cube`; a separate
    // profile because VITE_PROFILE is inlined at build time, so one deployment
    // serves exactly one of these — see .env.example.
    case "lending-app":
      return lendingJson as WorkspaceConfig;
    // The BorrowWorks operator desk. Same door and same data path as `lending-app`;
    // a separate profile because it renders the two-register surface rather than
    // the panel workspace, and VITE_PROFILE is inlined at build time.
    case "borrowworks":
      return borrowworksJson as WorkspaceConfig;
    default:
      return workspaceJson as WorkspaceConfig;
  }
}

const config: WorkspaceConfig = pickProfile(import.meta.env.VITE_PROFILE);

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
