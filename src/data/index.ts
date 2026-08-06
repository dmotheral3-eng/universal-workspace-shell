export type { DataProvider, Entity, Item, Document, DocSection, Stage, Metric } from "./types";
export type { MasterTodoRow, MasterTodoSource } from "./master-todo-types";
export { MockProvider } from "./mock-provider";

import { MockProvider } from "./mock-provider";
import { LawDogProvider } from "./lawdog-provider";
import { MockMasterTodoSource } from "./mock-master-todo";
import type { DataProvider } from "./types";
import type { MasterTodoSource } from "./master-todo-types";
import { getConfig } from "@/config";

let provider: DataProvider | null = null;

export function getDataProvider(): DataProvider {
  if (!provider) {
    const config = getConfig();
    if (config.data.mode.startsWith("lawdog") && config.data.lawdog) {
      provider = new LawDogProvider(config.data.lawdog);
    } else {
      provider = new MockProvider();
    }
  }
  return provider;
}

let masterTodoSource: MasterTodoSource | null = null;

export function getMasterTodoSource(): MasterTodoSource {
  if (!masterTodoSource) {
    const config = getConfig();
    if (config.data.mode === "mock") {
      masterTodoSource = new MockMasterTodoSource();
    } else {
      // swap point: plug real backend here → Postgres view v_motherdesk_master_todo
      masterTodoSource = new MockMasterTodoSource();
    }
  }
  return masterTodoSource;
}
