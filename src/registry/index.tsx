import type { PanelType } from "@/config/types";
import { EntityListPanel } from "@/panels/entity-list";
import { ItemTablePanel } from "@/panels/item-table";
import { ReadingPanePanel } from "@/panels/reading-pane";
import { ChatRailPanel } from "@/panels/chat-rail";
import { StageTrackerPanel } from "@/panels/stage-tracker";
import { MetricGridPanel } from "@/panels/metric-grid";
import { DocBrowserPanel } from "@/panels/doc-browser";
import { MasterBoardPanel } from "@/panels/master-board";
import { CoverageMatrixPanel } from "@/panels/coverage-matrix";

const panelMap: Record<PanelType, React.ComponentType> = {
  EntityList: EntityListPanel,
  ItemTable: ItemTablePanel,
  ReadingPane: ReadingPanePanel,
  ChatRail: ChatRailPanel,
  StageTracker: StageTrackerPanel,
  MetricGrid: MetricGridPanel,
  DocBrowser: DocBrowserPanel,
  MasterBoard: MasterBoardPanel,
  CoverageMatrix: CoverageMatrixPanel,
};

interface PanelRegistryProps {
  panelType: PanelType;
}

export function PanelRegistry({ panelType }: PanelRegistryProps) {
  const Component = panelMap[panelType];
  if (!Component) return null;
  return <Component />;
}
