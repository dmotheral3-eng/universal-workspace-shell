import { useEffect, useState } from "react";
import { Refine } from "@refinedev/core";
import type { IResourceItem } from "@refinedev/core";

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
import { loadResourcesFromRegistry } from "@/data/refine-resources";
import { pendingDataProvider } from "@/data/refine-providers-pending";

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

/**
 * Refine sits UNDER the shell, not around it (BOR-129).
 *
 * The nav-rail, the layout tree, the command palette and every face keep their
 * own chrome and their own routing; `<Refine>` is mounted beneath them purely
 * so the hooks — useTable / useShow / useMany / useForm / useLogList / useCan —
 * have a context to read. Nothing in this commit calls one yet, which is why
 * the app must render byte-for-byte as it did before: if anything moved on
 * screen, the mount is wrong.
 *
 * `resources` are fetched, never written down — see refine-resources.ts. They
 * start empty and arrive a tick later; a profile with no lending registry (or
 * a signed-out one) simply keeps the empty list, which is the honest answer for
 * a surface that has no rail of its own.
 *
 * ONLY `dataProvider` IS PASSED HERE, AND THAT IS A FINDING, NOT AN OMISSION.
 * BOR-129 as written asks for all four props at once. Mounted that way it does
 * not survive a page load: `<Refine>` CALLS `authProvider.check()` itself on
 * mount, so a not-yet-built auth provider throws on every render — observed
 * live at localhost:5200 before this was changed ("Unhandled Error in check:
 * refine always expects a resolved promise"). A provider prop is not inert; the
 * ones Refine drives on its own have to arrive WITH their implementations.
 * `dataProvider` is required by the type and is only ever reached through a
 * hook, and no hook is wired yet — so it can hold a loud stub for one commit.
 * authProvider lands in BOR-131, accessControl in BOR-132, auditLog in BOR-133.
 */
function RefineHost({ children }: { children: React.ReactNode }) {
  const [resources, setResources] = useState<IResourceItem[]>([]);

  useEffect(() => {
    let live = true;
    loadResourcesFromRegistry().then((r) => {
      if (live) setResources(r);
    });
    return () => {
      live = false;
    };
  }, []);

  return (
    <Refine
      dataProvider={pendingDataProvider}
      resources={resources}
      options={{
        mutationMode: "pessimistic",
        disableTelemetry: true,
        // The shell owns the URL. Refine must not also write to it, or the two
        // routers fight over the address bar.
        syncWithLocation: false,
      }}
    >
      {children}
    </Refine>
  );
}

export function App() {
  return (
    <TooltipProvider>
      <LayoutProvider>
        <RefineHost>
          <AppInner />
        </RefineHost>
      </LayoutProvider>
    </TooltipProvider>
  );
}

export default App;
