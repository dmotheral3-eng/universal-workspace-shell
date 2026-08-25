/**
 * The runtime profile switch — the DEV AND TEST path.
 *
 * D-BWSHELL-1: at BUILD time build-plugins/profile-bundle-plugin.ts substitutes
 * `virtual:profile-config` with the ACTIVE profile's JSON alone, so no other
 * client's brand, vocabulary or suggested questions reach a door's bundle. This
 * module is what that id resolves to under vitest and `vite dev`, where being
 * able to select any profile at runtime is the point (src/config/profile.test.ts
 * stubs VITE_PROFILE and re-imports).
 *
 * Because the shipped path and this path differ, the separation itself is
 * asserted against REAL BUILD OUTPUT in test/profile-bundle.test.ts rather than
 * here. A unit test of this file could never prove what a door downloads.
 */
import type { WorkspaceConfig } from "./types";
import lawdogJson from "./lawdog.config.json";
import workspaceJson from "./workspace.config.json";
import cubeJson from "./cube.config.json";
import lendingJson from "./lending-app.config.json";
import borrowworksJson from "./borrowworks.config.json";
import inboxJson from "./inbox.config.json";

function pickProfile(profile: string | undefined): WorkspaceConfig {
  switch (profile) {
    case "lawdog":
      return lawdogJson as WorkspaceConfig;
    case "cube":
      return cubeJson as WorkspaceConfig;
    case "lending-app":
      return lendingJson as WorkspaceConfig;
    case "borrowworks":
      return borrowworksJson as WorkspaceConfig;
    case "inbox":
      return inboxJson as WorkspaceConfig;
    default:
      return workspaceJson as WorkspaceConfig;
  }
}

export default pickProfile(import.meta.env.VITE_PROFILE) as WorkspaceConfig;
