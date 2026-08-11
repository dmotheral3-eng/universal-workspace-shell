/**
 * `@/data` stand-in for the proof build ONLY.
 *
 * vite.proof.config.ts aliases `@/data` here, so every panel resolves its provider
 * to the fixture one below and nothing in src/ has to know the proof harness
 * exists. That matters twice over: the product source stays untouched, and this
 * same file can be dropped onto an older tree to photograph the BEFORE state of
 * panels that never had an injection point.
 *
 * The provider extends the real LawDogProvider on the cube store, because the six
 * legal panels gate on exactly that (`provider instanceof LawDogProvider &&
 * isCubeStore()`), and a fixture that failed that check would photograph the
 * "not available in this workspace" state instead of the panel.
 *
 * NOTHING HERE SHIPS. It is not referenced by index.html, popout.html or
 * panels.html, and the proof build writes to its own output directory.
 */
import { LawDogProvider } from "../src/data/lawdog-provider";
import {
  mapPartyRow,
  mapRateRow,
  mapSavingRow,
  mapSubpoenaRow,
  mapClaimMathRow,
  mapRecoveryMathRow,
  groupClaimMath,
  sortParties,
} from "../src/data/lawdog-provider";
import {
  partyRows,
  rateRows,
  savingsRows,
  subpoenaRows,
  claimMathRows,
  recoveryMathRows,
} from "../src/data/lawdog-fixtures";
import { MockMasterTodoSource } from "../src/data/mock-master-todo";
import { documents, matters, metrics, stages, timeline } from "./fixtures";
import type { DataProvider, Document, Entity, Item, Metric, Stage } from "../src/data/types";

export type {
  DataProvider,
  Entity,
  Item,
  Document,
  DocSection,
  Stage,
  Metric,
} from "../src/data/types";
export type { MasterTodoRow, MasterTodoSource } from "../src/data/master-todo-types";
export { MockProvider } from "../src/data/mock-provider";

class FixtureProvider extends LawDogProvider implements DataProvider {
  constructor() {
    super({ store: "cube", url: "https://fixtures.invalid", anonKey: "fixtures" });
  }

  async listEntities(): Promise<Entity[]> {
    return matters;
  }

  async listItems(entityId: string): Promise<Item[]> {
    return timeline.filter((t) => t.entityId === entityId);
  }

  async listDocuments(): Promise<Document[]> {
    return documents;
  }

  async getDocument(docId: string): Promise<Document | null> {
    return documents.find((d) => d.id === docId) ?? null;
  }

  async getStages(): Promise<Stage[]> {
    return stages;
  }

  async getMetrics(): Promise<Metric[]> {
    return metrics;
  }

  async listParties() {
    return sortParties(partyRows.map(mapPartyRow));
  }

  async listRateCard() {
    return rateRows.map(mapRateRow);
  }

  async listSavings() {
    return savingsRows.map(mapSavingRow);
  }

  async listSubpoenas() {
    return subpoenaRows.map(mapSubpoenaRow);
  }

  async listClaimMath() {
    return groupClaimMath(claimMathRows.map(mapClaimMathRow));
  }

  async listRecoveryMath() {
    return recoveryMathRows.map(mapRecoveryMathRow);
  }
}

const provider = new FixtureProvider();

export function getDataProvider(): DataProvider {
  return provider;
}

const masterTodo = new MockMasterTodoSource();

export function getMasterTodoSource() {
  return masterTodo;
}
