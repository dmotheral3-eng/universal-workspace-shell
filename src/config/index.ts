import type { WorkspaceConfig } from "./types";
import lawdogJson from "./lawdog.config.json";
import workspaceJson from "./workspace.config.json";

export type { WorkspaceConfig, BrandConfig, VocabularyConfig, PanelType } from "./types";

const config: WorkspaceConfig =
  (import.meta.env.VITE_PROFILE === "lawdog" ? lawdogJson : workspaceJson) as WorkspaceConfig;

if (config.data.lawdog) {
  config.data.lawdog.anonKey = import.meta.env.VITE_LAWDOG_ANON_KEY ?? "";
}

export function getConfig(): WorkspaceConfig {
  return config;
}

export function getVocabulary() {
  return config.vocabulary;
}

export function getBrand() {
  return config.brand;
}
