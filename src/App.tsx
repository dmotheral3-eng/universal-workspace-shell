import { TooltipProvider } from "@/components/ui/tooltip";
import { LayoutProvider, LayoutRenderer, WorkspaceHeader, CollapsedRail, CommandPalette } from "@/shell";
import { PopoutProvider } from "@/shell/popout-context";
import { usePopoutManager } from "@/shell/popout-manager";
import { LawDogGate } from "@/shell/lawdog-gate";
import { NavRail } from "@/shell/nav-rail";
import { PathPanelRoute } from "@/shell/path-route";
import { getAuthConfig } from "@/config";
import { BorrowWorksApp } from "@/bw/bw-app";
import { SpectrumApp } from "@/spectrum/spectrum-app";
import { SemesterFace } from "@/faces/SemesterFace";
import { getConfig } from "@/config";

function AppInner() {
  const { openPopout } = usePopoutManager();
  const hasAuth = !!getAuthConfig();

  /**
   * The BorrowWorks desk brings its own chrome — header, lender switcher and a
   * registry-driven sidebar that persist across every surface — so it renders
   * INSTEAD of the panel workspace rather than inside one of its panels. It still
   * sits behind the same sign-in gate as everything else.
   */
  if (import.meta.env.VITE_PROFILE === "borrowworks") {
    return (
      <LawDogGate>
        <BorrowWorksApp />
      </LawDogGate>
    );
  }

  /**
   * The Spectrum face (D-LDSPECTRUM-1): a profile that declares face="spectrum"
   * gets the two-zone Read/Work chrome. Read is fixed and answer-arranged; Work
   * is the panel workspace below. Same gate, same data doors.
   */
  if (getConfig().face === "spectrum") {
    return (
      <LawDogGate>
        <PopoutProvider openPopout={openPopout}>
          <SpectrumApp />
        </PopoutProvider>
      </LawDogGate>
    );
  }

  /**
   * The Semester face (COS-1584 S4): a profile that declares face="semester"
   * wears the kit's chrome — 62px icon rail, 52px header, mono screen title —
   * around the same panel workspace, the same gate and the same data doors.
   * A profile that declares no face falls through to the branch below, which is
   * byte-for-byte what it has always been.
   */
  if (getConfig().face === "semester") {
    return (
      <LawDogGate>
        <PopoutProvider openPopout={openPopout}>
          <SemesterFace />
        </PopoutProvider>
      </LawDogGate>
    );
  }

  return (
    <LawDogGate>
      <PopoutProvider openPopout={openPopout}>
        <PathPanelRoute />
        <div className="flex h-screen w-screen flex-col overflow-hidden bg-background">
          <WorkspaceHeader />
          <div className="flex flex-1 overflow-hidden">
            {hasAuth && <NavRail />}
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
