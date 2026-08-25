/**
 * The FULL panel map — the DEV AND TEST path.
 *
 * D-BWSHELL-1: at BUILD time build-plugins/profile-bundle-plugin.ts substitutes
 * `virtual:panel-registry` with a map holding ONLY the active profile's panels,
 * so a door downloads no other profile's panel code. This module is what that id
 * resolves to under vitest and `vite dev`, where every panel should be reachable.
 *
 * Generated shape mirrors src/registry/panel-manifest.json, which is the single
 * declaration of PanelType -> module/export that the build plugin also reads.
 */
import { AttestationsPanel } from "@/panels/lending/attestations";
import { BooksPanel } from "@/panels/lending/books";
import { ChangesPanel } from "@/panels/lending/changes";
import { ChatRailPanel } from "@/panels/chat-rail";
import { ClaimValuePanel } from "@/panels/legal/claim-value";
import { CoverageMatrixPanel } from "@/panels/coverage-matrix";
import { DecisionsPanel } from "@/panels/lending/decisions";
import { DocBrowserPanel } from "@/panels/doc-browser";
import { EntityListPanel } from "@/panels/entity-list";
import { InboxBoardPanel } from "@/panels/inbox/board";
import { InteractionsPanel } from "@/panels/lending/interactions";
import { ItemTablePanel } from "@/panels/item-table";
import { LedgerPanel } from "@/panels/legal/ledger";
import { MasterBoardPanel } from "@/panels/master-board";
import { MasterCaseDocPanel } from "@/panels/legal/master-case-doc";
import { MatterHomePanel } from "@/panels/matter-home";
import { MetricGridPanel } from "@/panels/metric-grid";
import { PartiesPanel } from "@/panels/legal/parties";
import { RatesPanel } from "@/panels/legal/rates";
import { ReadingPanePanel } from "@/panels/reading-pane";
import { RecoveryOutlookPanel } from "@/panels/legal/recovery-outlook";
import { SavingsPanel } from "@/panels/legal/savings";
import { StageTrackerPanel } from "@/panels/stage-tracker";
import { SubpoenasPanel } from "@/panels/legal/subpoenas";
import { WhereWeArePanel } from "@/panels/whereweare";

export const panelMap = {
  "Attestations": AttestationsPanel,
  "Books": BooksPanel,
  "Changes": ChangesPanel,
  "ChatRail": ChatRailPanel,
  "ClaimValue": ClaimValuePanel,
  "CoverageMatrix": CoverageMatrixPanel,
  "Decisions": DecisionsPanel,
  "DocBrowser": DocBrowserPanel,
  "EntityList": EntityListPanel,
  "InboxBoard": InboxBoardPanel,
  "Interactions": InteractionsPanel,
  "ItemTable": ItemTablePanel,
  "Ledger": LedgerPanel,
  "MasterBoard": MasterBoardPanel,
  "MasterCaseDoc": MasterCaseDocPanel,
  "MatterHome": MatterHomePanel,
  "MetricGrid": MetricGridPanel,
  "Parties": PartiesPanel,
  "Rates": RatesPanel,
  "ReadingPane": ReadingPanePanel,
  "RecoveryOutlook": RecoveryOutlookPanel,
  "Savings": SavingsPanel,
  "StageTracker": StageTrackerPanel,
  "Subpoenas": SubpoenasPanel,
  "WhereWeAre": WhereWeArePanel,
};
