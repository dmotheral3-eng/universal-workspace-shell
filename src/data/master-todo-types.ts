export interface MasterTodoRow {
  lane: string;
  lane_key: string;
  source: string;
  item_id: string;
  title: string;
  detail: string;
  status: string;
  bucket: "active" | "held" | "remote";
  ref_url: string | null;
  age_hours: number;
  updated_at: string;
}

export interface MasterTodoSource {
  listAll(): Promise<MasterTodoRow[]>;
}
