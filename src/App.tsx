import { TooltipProvider } from "@/components/ui/tooltip";
import { LayoutProvider, LayoutRenderer, WorkspaceHeader, CollapsedRail, CommandPalette } from "@/shell";
import { PopoutProvider } from "@/shell/popout-context";
import { usePopoutManager } from "@/shell/popout-manager";
import { LawDogGate } from "@/shell/lawdog-gate";

function AppInner() {
  const { openPopout } = usePopoutManager();

  return (
    <LawDogGate>
      <PopoutProvider openPopout={openPopout}>
        <div className="flex h-screen w-screen flex-col overflow-hidden bg-background">
          <WorkspaceHeader />
          <div className="flex flex-1 overflow-hidden">
            <CollapsedRail />
            <LayoutRenderer />
          </div>
          <CommandPalette />
        </div>
      </PopoutProvider>
    </LawDogGate>
  );
}

export function App() {
  return (
    <TooltipProvider>
      <LayoutProvider>
        <AppInner />
      </LayoutProvider>
    </TooltipProvider>
  );
}

export default App;
