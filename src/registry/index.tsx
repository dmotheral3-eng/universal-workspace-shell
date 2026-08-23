import type { PanelType } from "@/config/types";
import { WhereWeArePanel } from "@/panels/whereweare";
import { InboxBoardPanel } from "@/panels/inbox/board";
import { EntityListPanel } from "@/panels/entity-list";
import { MatterHomePanel } from "@/panels/matter-home";
import { ItemTablePanel } from "@/panels/item-table";
import { ReadingPanePanel } from "@/panels/reading-pane";
import { ChatRailPanel } from "@/panels/chat-rail";
import { StageTrackerPanel } from "@/panels/stage-tracker";
import { MetricGridPanel } from "@/panels/metric-grid";
import { DocBrowserPanel } from "@/panels/doc-browser";
import { MasterBoardPanel } from "@/panels/master-board";
import { CoverageMatrixPanel } from "@/panels/coverage-matrix";
import { PartiesPanel } from "@/panels/legal/parties";
import { RatesPanel } from "@/panels/legal/rates";
import { SavingsPanel } from "@/panels/legal/savings";
import { SubpoenasPanel } from "@/panels/legal/subpoenas";
import { ClaimValuePanel } from "@/panels/legal/claim-value";
import { RecoveryOutlookPanel } from "@/panels/legal/recovery-outlook";
import { LedgerPanel } from "@/panels/legal/ledger";
import { BooksPanel } from "@/panels/lending/books";
import { DecisionsPanel } from "@/panels/lending/decisions";
import { InteractionsPanel } from "@/panels/lending/interactions";
import { ChangesPanel } from "@/panels/lending/changes";
import { AttestationsPanel } from "@/panels/lending/attestations";

const panelMap: Record<PanelType, React.ComponentType> = {
  WhereWeAre: WhereWeArePanel,
  InboxBoard: InboxBoardPanel,
  EntityList: EntityListPanel,
  MatterHome: MatterHomePanel,
  ItemTable: ItemTablePanel,
  ReadingPane: ReadingPanePanel,
  ChatRail: ChatRailPanel,
  StageTracker: StageTrackerPanel,
  MetricGrid: MetricGridPanel,
  DocBrowser: DocBrowserPanel,
  MasterBoard: MasterBoardPanel,
  CoverageMatrix: CoverageMatrixPanel,
  Parties: PartiesPanel,
  Rates: RatesPanel,
  Savings: SavingsPanel,
  Subpoenas: SubpoenasPanel,
  ClaimValue: ClaimValuePanel,
  RecoveryOutlook: RecoveryOutlookPanel,
  Ledger: LedgerPanel,
  Books: BooksPanel,
  Decisions: DecisionsPanel,
  Interactions: InteractionsPanel,
  Changes: ChangesPanel,
  Attestations: AttestationsPanel,
};

interface PanelRegistryProps {
  panelType: PanelType;
}

export function PanelRegistry({ panelType }: PanelRegistryProps) {
  const Component = panelMap[panelType];
  if (!Component) return null;
  return <Component />;
}
