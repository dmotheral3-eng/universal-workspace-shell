import type { AuthConfig, WorkspaceConfig } from "./types";
// D-BWSHELL-1: ONE config is bundled, chosen at build time by
// build-plugins/profile-bundle-plugin.ts from VITE_PROFILE. This file used to
// import all six statically and switch at runtime, which inlined every other
// client's brand, vocabulary and suggested questions into every door's bundle.
// VITE_PROFILE is a build-time constant, so the choice belongs at build time.
import profileJson from "virtual:profile-config";

export type { WorkspaceConfig, BrandConfig, VocabularyConfig, AuthConfig, PanelType } from "./types";

const config: WorkspaceConfig = profileJson as WorkspaceConfig;

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
