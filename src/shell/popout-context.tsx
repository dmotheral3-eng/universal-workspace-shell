import { createContext, useContext, type ReactNode } from "react";
import type { PanelTab } from "./layout-tree";

type OpenPopoutFn = (leafId: string, tabIndex: number, tab: PanelTab) => void;

const PopoutContext = createContext<OpenPopoutFn | null>(null);

export function PopoutProvider({ openPopout, children }: { openPopout: OpenPopoutFn; children: ReactNode }) {
  return <PopoutContext.Provider value={openPopout}>{children}</PopoutContext.Provider>;
}

export function useOpenPopout(): OpenPopoutFn {
  const ctx = useContext(PopoutContext);
  if (!ctx) throw new Error("useOpenPopout must be used within PopoutProvider");
  return ctx;
}
