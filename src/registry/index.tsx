import type { PanelType } from "@/config/types";
// D-BWSHELL-1: the map is GENERATED at build time from this profile's own
// `panels` array (build-plugins/profile-bundle-plugin.ts), so a door's bundle
// contains only its own panels. This file used to import all 25 statically,
// which is why every door shipped every profile's code. PanelType -> module is
// declared once in src/registry/panel-manifest.json.
import { panelMap } from "virtual:panel-registry";

interface PanelRegistryProps {
  panelType: PanelType;
}

export function PanelRegistry({ panelType }: PanelRegistryProps) {
  const Component = (panelMap as Partial<Record<PanelType, React.ComponentType>>)[panelType];
  if (!Component) return null;
  return <Component />;
}
