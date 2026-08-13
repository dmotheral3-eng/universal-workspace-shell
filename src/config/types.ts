export interface BrandConfig {
  name: string;
  logoText: string;
  accent: string;
  background: string;
  mode: "light" | "dark";
}

export interface VocabularyConfig {
  entity: string;
  entityPlural: string;
  item: string;
  itemPlural: string;
}

export interface ChatConfig {
  suggestedQuestions: string[];
}

/**
 * The sign-in door for a profile. `url`/`anonKey` are filled from env at load
 * (src/config/index.ts) — an anon key is public by design, but it still does
 * not belong in a committed JSON file.
 *
 * A profile with no `auth` block and no `lawdog` block runs with no sign-in at
 * all; that is the mock workspace, and it must stay that way.
 */
export interface AuthConfig {
  url: string;
  anonKey: string;
  /** localStorage key for the session. Distinct per door, so two doors on one origin do not collide. */
  storageKey?: string;
  /** Shown on the sign-in card. */
  label?: string;
}

export interface DataConfig {
  mode: "mock" | "supabase" | "lawdog-case" | "lawdog-cube" | "cube-broker";
  lawdog?: {
    store: "case" | "cube";
    url: string;
    anonKey: string;
    caseId?: string;
  };
  /**
   * Cube data reached through the server broker (/api/cube/*). Carries no URL
   * and no key on purpose — the browser is not told where the Cube is.
   */
  broker?: {
    /** Only for operators who belong to several tenants; the broker still verifies membership. */
    tenantId?: string;
  };
}

export type PanelType =
  | "EntityList"
  // the explain-first landing screen for one entity — orientation, then cards,
  // then the dense numbers (D-LDUX-2)
  | "MatterHome"
  | "ItemTable"
  | "ReadingPane"
  | "ChatRail"
  | "StageTracker"
  | "DocBrowser"
  | "MetricGrid"
  | "MasterBoard"
  | "CoverageMatrix"
  // legal data panels — cube store only, registered per profile in *.config.json
  | "Parties"
  | "Rates"
  | "Savings"
  | "Subpoenas"
  | "ClaimValue"
  | "RecoveryOutlook"
  // the matter's three-actor record — who said, did, produced, refused (port of the Ledger Console)
  | "Ledger";

export interface WorkspaceConfig {
  brand: BrandConfig;
  vocabulary: VocabularyConfig;
  panels: PanelType[];
  defaultLayout: string;
  chat: ChatConfig;
  data: DataConfig;
  auth?: AuthConfig;
}
