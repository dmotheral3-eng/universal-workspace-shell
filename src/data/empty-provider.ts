import type { DataProvider, Entity, Item, Document, Stage, Metric } from "./types";

/**
 * The provider a brokered profile gets when a generic panel asks for data.
 *
 * WHY THIS EXISTS (D-MSDOOR-2): getDataProvider() used to fall through to
 * MockProvider for every profile that was not Law Dog — including the lending
 * door, whose data.mode is "cube-broker". MockProvider's fixtures are a MEDICAL
 * demo (patients with DOB and MRN), so a lending client opening a generic panel
 * was shown another vertical's demo content beside its own lending Ask
 * suggestions. That is what was observed live on 2026-08-24.
 *
 * No tenant boundary was crossed and no real record was exposed — those
 * fixtures are invented and compiled into the client bundle — but a door must
 * not render a vertical that is not its own, so the honest answer to "what
 * entities are there?" on a brokered profile is NONE, and the panel says so.
 *
 * The brokered panels (Books, Decisions, Interactions, Changes, Attestations)
 * do not come through here at all; they read the broker directly.
 */
export class EmptyProvider implements DataProvider {
  async listEntities(): Promise<Entity[]> {
    return [];
  }
  async listItems(): Promise<Item[]> {
    return [];
  }
  async getDocument(): Promise<Document | null> {
    return null;
  }
  async listDocuments(): Promise<Document[]> {
    return [];
  }
  async getStages(): Promise<Stage[]> {
    return [];
  }
  async getMetrics(): Promise<Metric[]> {
    return [];
  }
}
