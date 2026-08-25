// D-BWSHELL-1: the panel map is emitted at build time by
// build-plugins/profile-bundle-plugin.ts from the active profile's `panels`
// array. Typed as a partial record because each profile declares its own
// subset — PanelRegistry already returns null for a panel this profile lacks.
declare module "virtual:panel-registry" {
  import type { ComponentType } from "react";
  import type { PanelType } from "@/config/types";
  export const panelMap: Partial<Record<PanelType, ComponentType>>;
}

// D-BWSHELL-1: the active profile's config JSON, inlined at build time so no
// other profile's config reaches the bundle.
declare module "virtual:profile-config" {
  import type { WorkspaceConfig } from "@/config/types";
  const config: WorkspaceConfig;
  export default config;
}
