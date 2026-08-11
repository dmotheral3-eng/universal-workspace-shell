export interface Entity {
  id: string;
  name: string;
  subtitle: string;
  status: string;
  tags: string[];
}

export interface Item {
  id: string;
  entityId: string;
  title: string;
  date: string;
  status: string;
  type: string;
  summary: string;
  evidenceSource?: string;
  statute?: string;
}

export interface DocSection {
  id: string;
  title: string;
  content: string;
}

export interface Document {
  id: string;
  title: string;
  type: "markdown" | "structured";
  sections: DocSection[];
  createdAt: string;
  category: string;
  /** Where this document stands — reviewed, pending, flagged, filed, and so on.
   *  Optional because the vocabulary is the store's, not the shell's: the evidence
   *  view colours whatever it is handed and falls back to a neutral chip. */
  status?: string;
}

export interface Stage {
  id: string;
  name: string;
  state: "done" | "current" | "pending" | "blocked";
  detail?: string;
}

export interface Metric {
  id: string;
  label: string;
  value: string;
  delta?: string;
  deltaDirection?: "up" | "down" | "neutral";
}

export interface DataProvider {
  listEntities(): Promise<Entity[]>;
  listItems(entityId: string): Promise<Item[]>;
  getDocument(docId: string): Promise<Document | null>;
  listDocuments(): Promise<Document[]>;
  getStages(entityId: string): Promise<Stage[]>;
  getMetrics(entityId: string): Promise<Metric[]>;
}
