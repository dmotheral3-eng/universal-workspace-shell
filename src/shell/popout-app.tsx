import { useEffect, useState } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PanelScopeProvider } from "./panel-scope";
import { PanelRegistry } from "@/registry";
import { initBusBridge, destroyBusBridge } from "@/bus/broadcast-bridge";
import type { PanelTab } from "./layout-tree";
import type { PanelType } from "@/config/types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Link, ArrowLeftToLine } from "lucide-react";

const POPOUT_CHANNEL = "workspace-popout-control";

interface PopoutParams {
  tabId: string;
  panelType: PanelType;
  title: string;
  scopeId?: string;
}

function getPopoutParams(): PopoutParams | null {
  const params = new URLSearchParams(window.location.search);
  const tabId = params.get("tabId");
  const panelType = params.get("panelType") as PanelType | null;
  const title = params.get("title");
  if (!tabId || !panelType || !title) return null;
  const scopeId = params.get("scopeId") || undefined;
  return { tabId, panelType, title, scopeId };
}

export function PopoutApp() {
  const [params] = useState(getPopoutParams);
  const [scopeId, setScopeId] = useState(params?.scopeId);
  const [scopeOptions, setScopeOptions] = useState<{ id: string; title: string }[]>([]);

  useEffect(() => {
    initBusBridge();
    return () => destroyBusBridge();
  }, []);

  useEffect(() => {
    if (!params) return;
    document.title = `${params.title} — Workspace Shell`;
  }, [params]);

  useEffect(() => {
    const channel = new BroadcastChannel(POPOUT_CHANNEL);

    channel.onmessage = (e) => {
      const msg = e.data;
      if (msg.type === "close-popout" && msg.tabId === params?.tabId) {
        window.close();
      }
      if (msg.type === "scope-options") {
        setScopeOptions(msg.options ?? []);
      }
    };

    channel.postMessage({ type: "popout-ready", tabId: params?.tabId });

    return () => channel.close();
  }, [params]);

  useEffect(() => {
    if (!params) return;
    const handleBeforeUnload = () => {
      const channel = new BroadcastChannel(POPOUT_CHANNEL);
      channel.postMessage({ type: "popout-closed", tabId: params.tabId });
      channel.close();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [params]);

  if (!params) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-foreground">
        <p className="text-sm text-muted-foreground">Invalid popout parameters.</p>
      </div>
    );
  }

  const tab: PanelTab = {
    id: params.tabId,
    panelType: params.panelType,
    title: params.title,
    scopeId,
  };

  const handleReturnToMain = () => {
    const channel = new BroadcastChannel(POPOUT_CHANNEL);
    channel.postMessage({ type: "popout-closed", tabId: params.tabId });
    channel.close();
    window.close();
  };

  const handleScopeChange = (newScopeId: string | undefined) => {
    setScopeId(newScopeId);
    const channel = new BroadcastChannel(POPOUT_CHANNEL);
    channel.postMessage({ type: "scope-changed", tabId: params.tabId, scopeId: newScopeId });
    channel.close();
  };

  const showFollowMenu = params.panelType !== "EntityList" && scopeOptions.length > 0;

  return (
    <TooltipProvider>
      <div className="flex h-screen w-screen flex-col overflow-hidden bg-background">
        <div className="flex h-8 items-center justify-between border-b border-border bg-muted/30 px-3">
          <span className="text-xs font-medium text-foreground">{params.title}</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground">
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {showFollowMenu && (
                <>
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger className="text-xs">
                      <Link className="mr-2 h-3.5 w-3.5" />
                      Follow scope
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      <DropdownMenuItem
                        onClick={() => handleScopeChange(undefined)}
                        className="text-xs"
                      >
                        Any (auto)
                        {!scopeId && <span className="ml-auto text-[10px] text-muted-foreground">current</span>}
                      </DropdownMenuItem>
                      {scopeOptions.map((opt) => (
                        <DropdownMenuItem
                          key={opt.id}
                          onClick={() => handleScopeChange(opt.id)}
                          className="text-xs"
                        >
                          {opt.title}
                          {scopeId === opt.id && <span className="ml-auto text-[10px] text-muted-foreground">current</span>}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuItem onClick={handleReturnToMain} className="text-xs">
                <ArrowLeftToLine className="mr-2 h-3.5 w-3.5" />
                Return to main window
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="flex-1 overflow-hidden">
          <PanelScopeProvider value={{ tab, leafId: "popout", tabIndex: 0 }}>
            <PanelRegistry panelType={params.panelType} />
          </PanelScopeProvider>
        </div>
      </div>
    </TooltipProvider>
  );
}
