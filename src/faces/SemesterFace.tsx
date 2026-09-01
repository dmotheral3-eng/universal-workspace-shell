import { useMemo, useState } from "react";
import Shell from "@centripetal/semester-kit/Shell";
import type { SemesterMode, SemesterNavItem } from "@centripetal/semester-kit/Shell";
import { THEMES } from "@centripetal/semester-kit/tokens";
import { Check, LogOut, PanelLeft, UserCircle } from "lucide-react";
import { getAuthConfig, getConfig, type PanelType } from "@/config";
import { useLayout } from "@/shell";
import { LayoutRenderer, CollapsedRail, CommandPalette } from "@/shell";
import { PathPanelRoute } from "@/shell/path-route";
import { PANEL_META, RAIL_ORDER } from "@/shell/nav-rail";
import { availablePanelTypes, panelLabel } from "@/shell/workspace-header";
import { getSession, onAuthChange, signOut, type LawDogSession } from "@/data/lawdog-auth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useEffect } from "react";

/**
 * SEMESTER FACE — COS-1584 S4, against the S3 ruling (i) (declaration 57187cee):
 * the kit renders ITSELF, inline, from its own token object. Nothing here
 * mirrors the kit's tokens into CSS vars and nothing re-derives them.
 *
 * THE SEAM: the rail's APPEARANCE comes from the kit; its CONTENTS come from
 * config. Every visible string and every icon below is looked up, never typed:
 *
 *   which panels   availablePanelTypes()  — profile.panels joined to the
 *                                           manifest (the BOR-33 derivation,
 *                                           reused rather than restated)
 *   icon + label   PANEL_META             — src/shell/nav-rail.tsx, the registry
 *                                           the default rail already uses
 *   titles         panelLabel()           — profile vocabulary, so "Books" reads
 *                                           as this profile's entity word
 *   wordmark       brand.logoText
 *   mode           brand.mode
 *
 * There is no NAV literal in this file, no screen-name comparisons, and no
 * geometry. The kit owns 62 / 52 / 27 / 7; this file must never learn them.
 */

/**
 * BrandConfig speaks light/dark; the kit's THEMES are keyed command/study.
 * Two closed unions declared in code on either side of one seam — this bridges
 * the types, it is not a data vocabulary that belongs in a table.
 */
function kitMode(brandMode: "light" | "dark"): SemesterMode {
  return brandMode === "dark" ? "command" : "study";
}

/**
 * The Panels menu and the account menu, in the kit header's right slot.
 *
 * These take their colour from the KIT's theme, not from Tailwind. The header
 * is the kit's surface, and in command mode it is near-black — muted-foreground
 * renders dark-on-dark there. Caught in the S4 dark-mode shot, not guessed.
 * The menu bodies stay shadcn: they are portalled onto the page, not into the
 * kit's header, and that boundary is exactly what S5 is looking at.
 */
function HeaderRight({ mode }: { mode: SemesterMode }) {
  const T = THEMES[mode];
  const auth = getAuthConfig();
  const { openPanel, getVisiblePanelTypes } = useLayout();
  const [session, setSession] = useState<LawDogSession | null>(() => getSession());

  useEffect(() => {
    if (!auth) return;
    setSession(getSession());
    return onAuthChange(setSession);
  }, [auth]);

  const visible = getVisiblePanelTypes();
  const panelTypes = availablePanelTypes();

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium transition-opacity hover:opacity-100"
            style={{ color: T.dim, opacity: 0.9 }}
            aria-label="Panels"
          >
            <PanelLeft className="h-3.5 w-3.5" />
            Panels
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          {panelTypes.map((pt) => {
            const isVisible = visible.includes(pt);
            return (
              <DropdownMenuItem
                key={pt}
                onClick={() => { if (!isVisible) openPanel(pt); }}
                className="text-xs flex items-center justify-between"
              >
                <span>{panelLabel(pt)}</span>
                {isVisible && <Check className="h-3.5 w-3.5 text-muted-foreground" />}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      {auth && session && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium transition-opacity hover:opacity-100"
              style={{ color: T.dim, opacity: 0.9 }}
              aria-label="Account"
            >
              <UserCircle className="h-3.5 w-3.5" />
              <span className="max-w-[140px] truncate">{session.email}</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <div className="px-2 py-1.5">
              <p className="text-[10px] text-muted-foreground">Signed in as</p>
              <p className="text-xs font-medium truncate">{session.email}</p>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => { void signOut(); }}
              className="text-xs text-destructive focus:text-destructive"
            >
              <LogOut className="mr-2 h-3.5 w-3.5" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </>
  );
}

export function SemesterFace() {
  const config = getConfig();
  const { focusPanel, getVisiblePanelTypes } = useLayout();

  const [mode, setMode] = useState<SemesterMode>(() => kitMode(config.brand.mode));

  /**
   * The profile's panels, joined to the registry for icon and label.
   *
   * Order follows RAIL_ORDER — the rail's own hint, which reads Books first
   * because the book is the lending entity — then appends anything the profile
   * registers that the hint does not name, so a new panel can never go missing
   * from the rail by being absent from a literal. Same shape as the BOR-33 fix.
   */
  const nav = useMemo<SemesterNavItem[]>(() => {
    const available = availablePanelTypes();
    const ordered = [
      ...RAIL_ORDER.filter((pt) => available.includes(pt)),
      ...available.filter((pt) => !RAIL_ORDER.includes(pt)),
    ];
    return ordered.map((pt) => ({
      key: pt,
      label: PANEL_META[pt].label,
      icon: PANEL_META[pt].icon as SemesterNavItem["icon"],
    }));
  }, []);

  /** The screen title is the panel's name in this profile's vocabulary. */
  const titles = useMemo<Record<string, string>>(
    () => Object.fromEntries(nav.map((n) => [n.key, panelLabel(n.key as PanelType)])),
    [nav],
  );

  /**
   * `screen` is not a second source of truth. It reads the workspace's own
   * panel state: the reader's pick while that panel is still mounted, and
   * otherwise whatever the workspace is actually showing. Closing a panel from
   * inside the workspace moves the rail with it.
   */
  const [picked, setPicked] = useState<PanelType | null>(null);
  const visible = getVisiblePanelTypes();
  const screen =
    picked && visible.includes(picked)
      ? picked
      : (nav.find((n) => visible.includes(n.key as PanelType))?.key ?? nav[0]?.key);

  return (
    <Shell
      mode={mode}
      onToggleMode={() => setMode((m) => (m === "command" ? "study" : "command"))}
      nav={nav}
      screen={screen}
      onScreen={(key) => {
        setPicked(key as PanelType);
        focusPanel(key as PanelType);
      }}
      titles={titles}
      wordmark={config.brand.logoText}
      headerRight={<HeaderRight mode={mode} />}
    >
      {/* The existing panel host, unchanged — drag, dock, tabs, pop-out. */}
      <PathPanelRoute />
      <div className="flex h-full min-h-0 w-full">
        <CollapsedRail />
        <LayoutRenderer />
      </div>
      <CommandPalette />
    </Shell>
  );
}

export default SemesterFace;
