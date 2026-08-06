import { useEffect, useState, useMemo } from "react";
import { bus } from "@/bus";
import { usePanelScope } from "@/shell/panel-scope";
import { getDataProvider } from "@/data";
import { LawDogProvider, DOMAINS, type CoverageCell } from "@/data/lawdog-provider";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search, AlertTriangle } from "lucide-react";

const SHORT: Record<string, string> = {
  chronology: "Chron",
  authenticity_and_metadata: "Auth",
  entity_and_capacity: "Entity",
  element_mapping: "Elem",
  damages_and_math: "Dmg",
  mitigation: "Mitig",
  absence_and_negative_proof: "Absence",
  privilege_and_PII: "PII",
  production_and_exhibit_readiness: "Prod",
  impeachment_and_prior_inconsistency: "Impeach",
};

export function CoverageMatrixPanel() {
  const { tab } = usePanelScope();
  const scopeId = tab.scopeId ?? null;
  const [entityId, setEntityId] = useState<string | null>(null);
  const [cells, setCells] = useState<CoverageCell[]>([]);
  const [search, setSearch] = useState("");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    return bus.onScoped("entity.selected", scopeId, (e) => setEntityId(e.entityId));
  }, [scopeId]);

  useEffect(() => {
    if (!entityId) return;
    const p = getDataProvider();
    if (!(p instanceof LawDogProvider)) {
      setErr("Coverage requires the Law Dog provider. Set data.mode to a lawdog store in workspace.config.json.");
      return;
    }
    setErr(null);
    p.getCoverage(entityId).then(setCells).catch((e) => setErr(String(e)));
  }, [entityId]);

  const filtered = useMemo(() => {
    if (!search) return cells;
    const l = search.toLowerCase();
    return cells.filter(
      (c) => c.filename.toLowerCase().includes(l) || (c.category ?? "").toLowerCase().includes(l)
    );
  }, [cells, search]);

  const stats = useMemo(() => {
    const total = cells.length;
    const uncited = cells.filter((c) => !c.citedById).length;
    const attested = cells.filter((c) => c.completeness === "complete_attested").length;
    return { total, uncited, attested, cells: total * DOMAINS.length };
  }, [cells]);

  if (err) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <p className="text-xs text-muted-foreground">{err}</p>
      </div>
    );
  }

  if (!entityId) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <p className="text-sm text-muted-foreground">Select a matter to screen coverage.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* The caveat is part of the panel, not a footnote. It must not be dismissible. */}
      <div className="flex items-start gap-2 border-b border-border bg-amber-500/10 px-3 py-2">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
        <p className="text-[11px] leading-snug text-muted-foreground">
          <span className="font-medium text-foreground">This is a screen, not a verdict.</span>{" "}
          With no evidence-link table, examination is inferred from whether a document's ID appears
          in the timeline corpus — which over-counts gaps, since anything cited by filename or thread
          ID reads as uncited. Every hit needs eyes before it is called a gap.
        </p>
      </div>

      <div className="flex items-center gap-3 border-b border-border px-3 py-1.5 text-[11px]">
        <span className="text-muted-foreground">
          <span className="font-mono font-medium text-foreground">{stats.total}</span> docs
        </span>
        <span className="text-muted-foreground">
          <span className="font-mono font-medium text-foreground">{stats.attested}</span> attested
        </span>
        <span className="text-muted-foreground">
          <span className="font-mono font-medium text-amber-600">{stats.uncited}</span> uncited
        </span>
        <span className="ml-auto font-mono text-muted-foreground">{stats.cells} cells</span>
      </div>

      <div className="border-b border-border p-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter documents..."
            className="h-7 pl-7 text-xs"
          />
        </div>
      </div>

      <ScrollArea className="flex-1">
        <table className="w-full text-[11px]">
          <thead className="sticky top-0 z-10 bg-background">
            <tr className="border-b border-border">
              <th className="px-2 py-1.5 text-left font-medium">Document</th>
              {DOMAINS.map((d) => (
                <th key={d} className="px-1 py-1.5 text-center font-medium" title={d}>
                  <span className="text-[9px] text-muted-foreground">{SHORT[d]}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr
                key={c.docId}
                className="cursor-pointer border-b border-border/40 hover:bg-accent/40"
                onClick={() =>
                  bus.emit("doc.open", {
                    scopeId: tab.id,
                    docId: c.docId,
                    docTitle: c.filename,
                  })
                }
              >
                <td className="max-w-[280px] px-2 py-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate" title={c.filename}>
                      {c.filename}
                    </span>
                    {!c.citedById && (
                      <Badge variant="outline" className="h-4 shrink-0 px-1 text-[9px] text-amber-600">
                        uncited
                      </Badge>
                    )}
                  </div>
                  <span className="font-mono text-[9px] text-muted-foreground">{c.docKey}</span>
                </td>
                {DOMAINS.map((d) => (
                  <td key={d} className="px-1 py-1 text-center">
                    <span
                      className={
                        c.domains[d]
                          ? "inline-block h-2 w-2 rounded-full bg-emerald-500"
                          : "inline-block h-2 w-2 rounded-full bg-muted-foreground/20"
                      }
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollArea>
    </div>
  );
}
