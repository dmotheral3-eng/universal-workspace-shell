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

export interface DataConfig {
  mode: "mock" | "supabase" | "lawdog-case" | "lawdog-cube";
  lawdog?: {
    store: "case" | "cube";
    url: string;
    anonKey: string;
    caseId?: string;
  };
}

export type PanelType =
  | "EntityList"
  | "ItemTable"
  | "ReadingPane"
  | "ChatRail"
  | "StageTracker"
  | "DocBrowser"
  | "MetricGrid"
  | "MasterBoard"
  | "CoverageMatrix";

export interface WorkspaceConfig {
  brand: BrandConfig;
  vocabulary: VocabularyConfig;
  panels: PanelType[];
  defaultLayout: string;
  chat: ChatConfig;
  data: DataConfig;
}
