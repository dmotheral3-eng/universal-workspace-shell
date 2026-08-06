import { createContext, useContext } from "react";
import type { PanelTab } from "./layout-tree";

interface PanelScopeValue {
  tab: PanelTab;
  leafId: string;
  tabIndex: number;
}

const PanelScopeContext = createContext<PanelScopeValue | null>(null);

export const PanelScopeProvider = PanelScopeContext.Provider;

export function usePanelScope(): PanelScopeValue {
  const ctx = useContext(PanelScopeContext);
  if (!ctx) throw new Error("usePanelScope must be used within a PanelScopeProvider");
  return ctx;
}
