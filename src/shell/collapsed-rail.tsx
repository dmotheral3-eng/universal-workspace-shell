import { useLayout } from "./layout-context";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { List, Table, FileText, MessageSquare, GitBranch, BarChart3, FolderOpen, LayoutDashboard, Grid3X3, Users, Tag, PiggyBank, Gavel, Calculator, Target } from "lucide-react";
import type { PanelType } from "@/config/types";

const panelIcons: Record<PanelType, React.ComponentType<{ className?: string }>> = {
  EntityList: List,
  ItemTable: Table,
  ReadingPane: FileText,
  ChatRail: MessageSquare,
  StageTracker: GitBranch,
  MetricGrid: BarChart3,
  DocBrowser: FolderOpen,
  MasterBoard: LayoutDashboard,
  CoverageMatrix: Grid3X3,
  Parties: Users,
  Rates: Tag,
  Savings: PiggyBank,
  Subpoenas: Gavel,
  ClaimValue: Calculator,
  RecoveryOutlook: Target,
};

export function CollapsedRail() {
  const { layout, restorePanel } = useLayout();

  if (layout.collapsedPanels.length === 0) return null;

  return (
    <div className="flex w-10 flex-col items-center gap-1 border-r border-border bg-muted/30 py-2">
      {layout.collapsedPanels.map((tab) => {
        const Icon = panelIcons[tab.panelType] ?? FileText;
        return (
          <Tooltip key={tab.id}>
            <TooltipTrigger asChild>
              <button
                onClick={() => restorePanel(tab)}
                className="flex h-8 w-8 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              >
                <Icon className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs">
              {tab.title}
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
