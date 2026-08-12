import { getBrand, getConfig, type PanelType } from "@/config";
import { useLayout } from "./layout-context";
import {
  List, Home, Table, FileText, MessageSquare, GitBranch,
  BarChart3, FolderOpen, LayoutDashboard, Grid3X3,
  Users, Tag, PiggyBank, Gavel, Calculator, Target,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const PANEL_META: Record<PanelType, { icon: React.ComponentType<{ className?: string }>; label: string; group: "core" | "legal" | "chat" }> = {
  EntityList:     { icon: List,            label: "Matters",        group: "core" },
  MatterHome:     { icon: Home,            label: "Matter",         group: "core" },
  ItemTable:      { icon: Table,           label: "Timeline",       group: "core" },
  DocBrowser:     { icon: FolderOpen,      label: "Evidence",       group: "core" },
  StageTracker:   { icon: GitBranch,       label: "Stages",         group: "core" },
  MetricGrid:     { icon: BarChart3,       label: "Metrics",        group: "core" },
  MasterBoard:    { icon: LayoutDashboard, label: "Board",          group: "core" },
  CoverageMatrix: { icon: Grid3X3,         label: "Coverage",       group: "core" },
  ReadingPane:    { icon: FileText,        label: "Reading",        group: "core" },
  ChatRail:       { icon: MessageSquare,   label: "Ask",            group: "chat" },
  Parties:        { icon: Users,           label: "Parties",        group: "legal" },
  Rates:          { icon: Tag,             label: "Rates",          group: "legal" },
  Savings:        { icon: PiggyBank,       label: "Savings",        group: "legal" },
  Subpoenas:      { icon: Gavel,           label: "Subpoenas",      group: "legal" },
  ClaimValue:     { icon: Calculator,      label: "Claim",          group: "legal" },
  RecoveryOutlook:{ icon: Target,          label: "Recovery",       group: "legal" },
};

/** Show this subset in the rail by default — keep it tight. */
const RAIL_ORDER: PanelType[] = [
  "EntityList",
  "MatterHome",
  "ItemTable",
  "DocBrowser",
  "StageTracker",
  "ChatRail",
  "Parties",
  "Subpoenas",
  "ClaimValue",
  "RecoveryOutlook",
];

function hex(h: string, alpha = 1): string {
  const r = parseInt(h.slice(1, 3), 16);
  const g = parseInt(h.slice(3, 5), 16);
  const b = parseInt(h.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function NavRail() {
  const brand = getBrand();
  const config = getConfig();
  const { openPanel, isPanelVisible, getVisiblePanelTypes } = useLayout();

  const registered = new Set(config.panels ?? []);
  const items = RAIL_ORDER.filter((pt) => registered.has(pt));
  const visible = new Set(getVisiblePanelTypes());

  const accent = brand.accent ?? "#5E6AD2";

  const bgStyle: React.CSSProperties = {
    background: accent,
  };

  return (
    <nav
      className="flex w-14 flex-shrink-0 flex-col items-center gap-0.5 overflow-y-auto py-2"
      style={bgStyle}
      aria-label="Navigation"
    >
      {items.map((pt, idx) => {
        const meta = PANEL_META[pt];
        const isChat = meta.group === "chat";
        const isActive = visible.has(pt);
        const prev = idx > 0 ? PANEL_META[items[idx - 1]] : null;
        const needsDivider = prev && meta.group !== prev.group;
        const Icon = meta.icon;

        return (
          <div key={pt} className="flex w-full flex-col items-center">
            {needsDivider && (
              <div
                className="my-1 h-px w-8"
                style={{ background: hex(accent.startsWith("#") ? "#ffffff" : "#ffffff", 0.2) }}
              />
            )}

            {isChat ? (
              /* Chat entry: visually PRIMARY — filled white pill so it stands out */
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => openPanel(pt)}
                    className="mx-1 flex w-11 flex-col items-center gap-0.5 rounded-lg px-1 py-1.5 transition-all"
                    style={{
                      background: "rgba(255,255,255,0.18)",
                      border: "1.5px solid rgba(255,255,255,0.55)",
                      boxShadow: isActive
                        ? "0 0 0 2px rgba(255,255,255,0.45), 0 2px 8px rgba(0,0,0,0.18)"
                        : "none",
                    }}
                    aria-label={meta.label}
                    aria-pressed={isActive}
                  >
                    <Icon className="h-4 w-4" style={{ color: "#fff" }} />
                    <span
                      className="text-[9px] font-semibold leading-none"
                      style={{ color: "#fff" }}
                    >
                      {meta.label}
                    </span>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="text-xs">
                  Ask — chat about any matter
                </TooltipContent>
              </Tooltip>
            ) : (
              /* All other entries */
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => openPanel(pt)}
                    className="flex w-full flex-col items-center gap-0.5 rounded px-1 py-1.5 transition-all"
                    style={
                      isActive
                        ? {
                            background: "rgba(255,255,255,0.22)",
                            color: "#fff",
                          }
                        : {
                            color: "rgba(255,255,255,0.75)",
                          }
                    }
                    onMouseEnter={(e) => {
                      if (!isActive)
                        (e.currentTarget as HTMLButtonElement).style.background =
                          "rgba(255,255,255,0.12)";
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive)
                        (e.currentTarget as HTMLButtonElement).style.background = "";
                    }}
                    aria-label={meta.label}
                    aria-pressed={isActive}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="text-[9px] leading-none">{meta.label}</span>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="text-xs">
                  {meta.label}
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        );
      })}
    </nav>
  );
}
