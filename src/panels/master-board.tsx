import { useEffect, useState, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight, Filter } from "lucide-react";
import { getMasterTodoSource } from "@/data";
import { ExplainScreen } from "./explain";
import type { MasterTodoRow } from "@/data/master-todo-types";

const LANE_ORDER = [
  "os",
  "mineral",
  "legal",
  "healthcare",
  "jetbrains",
  "traffic",
  "wellness",
  "support",
] as const;

const LANE_COLORS: Record<string, string> = {
  os: "border-t-blue-500",
  mineral: "border-t-amber-600",
  legal: "border-t-violet-500",
  healthcare: "border-t-rose-500",
  jetbrains: "border-t-orange-500",
  traffic: "border-t-emerald-600",
  wellness: "border-t-teal-500",
  support: "border-t-slate-500",
};

function formatAge(hours: number): string {
  if (hours === 0) return "--";
  if (hours < 24) return `${Math.round(hours)}h`;
  const days = hours / 24;
  if (days < 7) return `${Math.round(days)}d`;
  const weeks = days / 7;
  return `${Math.round(weeks)}w`;
}

function StatusPill({ bucket }: { bucket: MasterTodoRow["bucket"] }) {
  if (bucket === "active") {
    return (
      <Badge
        variant="secondary"
        className="bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 text-[10px] px-1.5 py-0"
      >
        active
      </Badge>
    );
  }
  if (bucket === "held") {
    return (
      <Badge
        variant="secondary"
        className="bg-red-50 text-red-700 dark:bg-red-900/40 dark:text-red-300 text-[10px] px-1.5 py-0"
      >
        held
      </Badge>
    );
  }
  return (
    <Badge
      variant="secondary"
      className="bg-muted text-muted-foreground text-[10px] px-1.5 py-0"
    >
      remote
    </Badge>
  );
}

function ItemRow({ item }: { item: MasterTodoRow }) {
  const isRemote = item.bucket === "remote";

  return (
    <div
      className={`flex items-start gap-3 px-3 py-2 border-b border-border/50 last:border-b-0 ${
        isRemote ? "opacity-50" : "hover:bg-accent/50"
      }`}
    >
      <div className="flex-1 min-w-0 space-y-0.5">
        <div className="flex items-center gap-2">
          {item.ref_url ? (
            <a
              href={item.ref_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-medium text-foreground hover:underline truncate"
            >
              {item.title}
            </a>
          ) : (
            <span className="text-xs font-medium text-foreground truncate">
              {item.title}
            </span>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground truncate">
          {item.detail}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0 pt-0.5">
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal">
          {item.source}
        </Badge>
        <StatusPill bucket={item.bucket} />
        <span className="text-[10px] text-muted-foreground font-mono w-6 text-right">
          {formatAge(item.age_hours)}
        </span>
      </div>
    </div>
  );
}

interface LaneSectionProps {
  laneKey: string;
  laneName: string;
  items: MasterTodoRow[];
}

function LaneSection({ laneKey, laneName, items }: LaneSectionProps) {
  const [open, setOpen] = useState(true);
  const isRemote = items.length > 0 && items[0].bucket === "remote";
  const activeCount = items.filter((i) => i.bucket === "active").length;
  const heldCount = items.filter((i) => i.bucket === "held").length;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div
        className={`border border-border rounded-md overflow-hidden border-t-2 ${
          LANE_COLORS[laneKey] ?? "border-t-border"
        }`}
      >
        <CollapsibleTrigger asChild>
          <button className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-accent/50 transition-colors">
            {open ? (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            )}
            <span className="text-xs font-semibold text-foreground flex-1">
              {laneName}
            </span>
            {isRemote ? (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal">
                remote
              </Badge>
            ) : (
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-muted-foreground font-mono">
                  {activeCount}
                </span>
                {heldCount > 0 && (
                  <span className="text-[10px] text-red-500 font-mono">
                    +{heldCount} held
                  </span>
                )}
              </div>
            )}
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="border-t border-border/50">
            {items.map((item) => (
              <ItemRow key={item.item_id} item={item} />
            ))}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

export function MasterBoardPanel() {
  const [rows, setRows] = useState<MasterTodoRow[]>([]);
  const [filter, setFilter] = useState("");
  const [heldOnly, setHeldOnly] = useState(false);

  useEffect(() => {
    getMasterTodoSource()
      .listAll()
      .then(setRows);
  }, []);

  const filtered = useMemo(() => {
    let result = rows;
    if (heldOnly) {
      result = result.filter((r) => r.bucket === "held");
    }
    if (filter.trim()) {
      const q = filter.toLowerCase();
      result = result.filter(
        (r) =>
          r.title.toLowerCase().includes(q) ||
          r.detail.toLowerCase().includes(q) ||
          r.lane.toLowerCase().includes(q) ||
          r.source.toLowerCase().includes(q)
      );
    }
    return result;
  }, [rows, filter, heldOnly]);

  const laneGroups = useMemo(() => {
    const map = new Map<string, { name: string; items: MasterTodoRow[] }>();
    for (const r of filtered) {
      const existing = map.get(r.lane_key);
      if (existing) {
        existing.items.push(r);
      } else {
        map.set(r.lane_key, { name: r.lane, items: [r] });
      }
    }
    const ordered: { key: string; name: string; items: MasterTodoRow[] }[] = [];
    for (const key of LANE_ORDER) {
      const g = map.get(key);
      if (g) ordered.push({ key, ...g });
    }
    return ordered;
  }, [filtered]);

  const totalActive = rows.filter((r) => r.bucket === "active").length;
  const totalHeld = rows.filter((r) => r.bucket === "held").length;

  return (
    <ExplainScreen
      explain={{
        title: "Master board",
        what: "Everything still open across every line of work, in one list — not just this matter, and not just legal.",
        where: (
          <>
            <span className="font-mono">{totalActive}</span>{" "}
            {totalActive === 1 ? "item is" : "items are"} moving
            {totalHeld > 0 ? (
              <>
                {" and "}
                <span className="font-mono">{totalHeld}</span>{" "}
                {totalHeld === 1 ? "is" : "are"} held up
              </>
            ) : null}
            .
          </>
        ),
        next:
          totalHeld > 0
            ? "Start with what is held — held means something is waiting on a decision, not on work."
            : "Nothing is held. Work the lanes below in whatever order suits the day.",
      }}
    >
      <div className="shrink-0 border-b border-border px-3 py-2.5 space-y-2">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Filter className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            <Input
              placeholder="Filter lanes, titles, sources…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="h-7 pl-7 text-xs"
            />
          </div>
          <button
            onClick={() => setHeldOnly((v) => !v)}
            className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-[10px] font-medium transition-colors ${
              heldOnly
                ? "border-red-300 bg-red-50 text-red-700 dark:border-red-700 dark:bg-red-900/30 dark:text-red-300"
                : "border-border bg-background text-muted-foreground hover:bg-accent"
            }`}
          >
            held only
          </button>
        </div>
      </div>

      <div>
        <div className="p-3 space-y-2">
          {laneGroups.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-8">
              No items match the current filter.
            </p>
          )}
          {laneGroups.map((g) => (
            <LaneSection
              key={g.key}
              laneKey={g.key}
              laneName={g.name}
              items={g.items}
            />
          ))}
        </div>
      </div>

      <div className="shrink-0 border-t border-border px-3 py-1.5">
        <p className="text-[9px] font-mono text-muted-foreground/60 text-center tracking-wider">
          SOURCES ARE THE SYSTEMS OF RECORD · REMOTE LANES SHOWN HONESTLY UNTIL
          THEIR FEEDS ARE WIRED · v_motherdesk_master_todo
        </p>
      </div>
    </ExplainScreen>
  );
}
