import { useEffect, useRef } from "react";
import { useLayout } from "./layout-context";
import { initBusBridge, destroyBusBridge } from "@/bus/broadcast-bridge";
import type { PanelTab } from "./layout-tree";

const POPOUT_CHANNEL = "workspace-popout-control";

export function usePopoutManager() {
  const { popOutPanel, returnPoppedPanel, poppedOutPanels, getTabsByType } = useLayout();
  const windowsRef = useRef<Map<string, Window>>(new Map());
  const channelRef = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    initBusBridge();
    return () => destroyBusBridge();
  }, []);

  useEffect(() => {
    const channel = new BroadcastChannel(POPOUT_CHANNEL);
    channelRef.current = channel;

    channel.onmessage = (e) => {
      const msg = e.data;
      if (msg.type === "popout-closed") {
        windowsRef.current.delete(msg.tabId);
        returnPoppedPanel(msg.tabId);
      }
      if (msg.type === "popout-ready" && msg.tabId) {
        const entityLists = getTabsByType("EntityList");
        channel.postMessage({
          type: "scope-options",
          options: entityLists.map((t) => ({ id: t.id, title: t.title })),
        });
      }
      if (msg.type === "scope-changed") {
        // The scope changed in the popout — we could update layout state if needed
      }
    };

    return () => {
      channel.close();
      channelRef.current = null;
    };
  }, [returnPoppedPanel, getTabsByType]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      windowsRef.current.forEach((w) => {
        try { w.close(); } catch { /* ignore */ }
      });
      windowsRef.current.clear();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  const openPopout = (leafId: string, tabIndex: number, tab: PanelTab) => {
    const params = new URLSearchParams({
      tabId: tab.id,
      panelType: tab.panelType,
      title: tab.title,
    });
    if (tab.scopeId) params.set("scopeId", tab.scopeId);

    const width = 800;
    const height = 600;
    const left = window.screenX + 100;
    const top = window.screenY + 100;

    const popup = window.open(
      `/popout.html?${params.toString()}`,
      `popout-${tab.id}`,
      `width=${width},height=${height},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no`
    );

    if (popup) {
      windowsRef.current.set(tab.id, popup);
      popOutPanel(leafId, tabIndex);
    }
  };

  return { openPopout, poppedOutPanels };
}
