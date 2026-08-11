import { useEffect, useMemo, useState, type ComponentType } from "react";
import { bus } from "@/bus";
import { getDataProvider, type Document } from "@/data";
import { getVocabulary } from "@/config";
import { useLayout } from "@/shell/layout-context";
import { usePanelScope } from "@/shell/panel-scope";
import { Input } from "@/components/ui/input";
import {
  FileText,
  Image,
  Mail,
  FlaskConical,
  Gavel,
  Banknote,
  FileSpreadsheet,
  BookOpen,
  Video,
  Mic,
  ScrollText,
  Search,
} from "lucide-react";
import {
  Chip,
  EvidenceTile,
  ExplainScreen,
  PrimaryAction,
  TileGrid,
  humanizeStatus,
  statusTone,
  type Tone,
} from "./explain";

/**
 * THE EVIDENCE VIEW — the screen the Bolt portal was easiest to understand on,
 * and the one this panel now copies: tiles rather than a file tree, a type icon
 * per document, a coloured chip saying where it stands, and counts you can click.
 *
 * Explain-first (ruling 2026-08-10): what this is, how much of it is unread, and
 * which document to open next — above the tiles, always.
 */

/** Icon by what the thing IS, read off category and filename. A person scanning
 *  a wall of tiles recognises a shape before they read a word. */
const KIND_ICONS: [RegExp, ComponentType<{ className?: string }>, string][] = [
  [/photo|image|screenshot|\.(png|jpe?g|gif|heic|webp)$/i, Image, "Image"],
  [/email|e-mail|correspond|letter|\.eml$/i, Mail, "Correspondence"],
  [/lab|result|test|panel|assay/i, FlaskConical, "Results"],
  [/filing|pleading|motion|order|court|subpoena|docket|brief/i, Gavel, "Court filing"],
  [/financ|invoice|statement|ledger|bank|payment|receipt|tax/i, Banknote, "Financial"],
  [/spreadsheet|\.(csv|xlsx?|numbers)$|data|schedule/i, FileSpreadsheet, "Spreadsheet"],
  [/contract|agreement|deed|lease|settlement|decree/i, ScrollText, "Agreement"],
  [/education|guide|policy|manual|handbook/i, BookOpen, "Reference"],
  [/video|recording|\.(mp4|mov|avi)$/i, Video, "Video"],
  [/audio|call|voicemail|\.(mp3|wav|m4a)$/i, Mic, "Audio"],
];

export function documentKind(doc: Document): {
  icon: ComponentType<{ className?: string }>;
  label: string;
} {
  const haystack = `${doc.category} ${doc.title}`;
  for (const [pattern, icon, label] of KIND_ICONS) {
    if (pattern.test(haystack)) return { icon, label };
  }
  return { icon: FileText, label: doc.category || "Document" };
}

type Filter = "all" | "good" | "warn" | "risk";

const FILTER_LABEL: Record<Exclude<Filter, "all">, string> = {
  good: "Reviewed",
  warn: "Pending",
  risk: "Flagged",
};

export function EvidenceView({
  documents,
  entityName,
  onOpen,
  selectedId,
}: {
  documents: Document[];
  entityName: string | null;
  onOpen: (doc: Document) => void;
  selectedId: string | null;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const counts = useMemo(() => {
    const c = { good: 0, warn: 0, risk: 0 };
    for (const d of documents) {
      const tone = statusTone(d.status);
      if (tone === "good") c.good += 1;
      else if (tone === "risk") c.risk += 1;
      else c.warn += 1;
    }
    return c;
  }, [documents]);

  const visible = useMemo(() => {
    const lower = search.trim().toLowerCase();
    return documents.filter((d) => {
      const tone = statusTone(d.status);
      const bucket: Exclude<Filter, "all"> = tone === "good" ? "good" : tone === "risk" ? "risk" : "warn";
      if (filter !== "all" && bucket !== filter) return false;
      if (!lower) return true;
      return (
        d.title.toLowerCase().includes(lower) ||
        d.category.toLowerCase().includes(lower) ||
        String(d.status ?? "").toLowerCase().includes(lower)
      );
    });
  }, [documents, search, filter]);

  const categories = useMemo(
    () => [...new Set(visible.map((d) => d.category))],
    [visible]
  );

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
        <div className="relative min-w-[180px] flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search the evidence…"
            className="h-8 pl-8 text-[13px]"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Chip
            label="Everything"
            tone="neutral"
            count={documents.length}
            active={filter === "all"}
            onClick={() => setFilter("all")}
          />
          {(["good", "warn", "risk"] as const).map((k) => (
            <Chip
              key={k}
              label={FILTER_LABEL[k]}
              tone={k}
              count={counts[k]}
              active={filter === k}
              onClick={() => setFilter(filter === k ? "all" : k)}
              title={`Show only ${FILTER_LABEL[k].toLowerCase()} documents`}
            />
          ))}
        </div>
      </div>

      {documents.length === 0 ? (
        <p className="px-4 py-6 text-[13px] text-muted-foreground">
          No documents recorded{entityName ? ` for ${entityName}` : ""} yet. That is a normal
          reading, not a failure.
        </p>
      ) : visible.length === 0 ? (
        <p className="px-4 py-6 text-[13px] text-muted-foreground">
          Nothing matches that filter. Pick “Everything” to see all {documents.length}.
        </p>
      ) : (
        categories.map((category) => (
          <section key={category}>
            <div className="flex items-baseline gap-2 px-4 pt-3">
              <h3 className="text-[13px] font-medium text-foreground">{category}</h3>
              <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                {visible.filter((d) => d.category === category).length}
              </span>
            </div>
            <TileGrid>
              {visible
                .filter((d) => d.category === category)
                .map((doc) => {
                  const kind = documentKind(doc);
                  return (
                    <EvidenceTile
                      key={doc.id}
                      title={doc.title}
                      kind={kind.label}
                      date={doc.createdAt ? doc.createdAt.slice(0, 10) : undefined}
                      status={humanizeStatus(doc.status)}
                      icon={kind.icon}
                      tone={statusTone(doc.status) as Tone}
                      selected={selectedId === doc.id}
                      onOpen={() => onOpen(doc)}
                    />
                  );
                })}
            </TileGrid>
          </section>
        ))
      )}
    </>
  );
}

export function DocBrowserPanel() {
  const vocab = getVocabulary();
  const { tab } = usePanelScope();
  const { openPanel, isPanelVisible } = useLayout();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [entityName, setEntityName] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const scopeId = tab.scopeId ?? null;

  useEffect(() => {
    getDataProvider().listDocuments().then(setDocuments);
  }, []);

  useEffect(() => {
    setSelectedId(null);
    setEntityName(null);
  }, [scopeId]);

  useEffect(() => {
    return bus.onScoped("entity.selected", scopeId, (e) => setEntityName(e.entityName));
  }, [scopeId]);

  const handleOpen = (doc: Document) => {
    setSelectedId(doc.id);
    if (!isPanelVisible("ReadingPane")) openPanel("ReadingPane");
    bus.emit("doc.open", { scopeId: scopeId ?? tab.id, docId: doc.id, docTitle: doc.title });
  };

  const counts = useMemo(() => {
    const c = { good: 0, warn: 0, risk: 0 };
    for (const d of documents) {
      const tone = statusTone(d.status);
      if (tone === "good") c.good += 1;
      else if (tone === "risk") c.risk += 1;
      else c.warn += 1;
    }
    return c;
  }, [documents]);

  // The one document most worth opening right now: flagged beats unread, and
  // within a bucket the oldest has been waiting longest.
  const nextDoc = useMemo(() => {
    const byAge = (a: Document, b: Document) => String(a.createdAt).localeCompare(String(b.createdAt));
    const flagged = documents.filter((d) => statusTone(d.status) === "risk").sort(byAge);
    if (flagged.length > 0) return flagged[0];
    const pending = documents.filter((d) => statusTone(d.status) === "warn").sort(byAge);
    return pending[0] ?? null;
  }, [documents]);

  const where = entityName
    ? <>Looking at the evidence in <span className="font-medium">{entityName}</span>.</>
    : `Showing every document available in this workspace. Pick a ${vocab.entity.toLowerCase()} to narrow it.`;

  const next =
    documents.length === 0
      ? "Nothing has been filed into this workspace yet."
      : counts.risk > 0
        ? `${counts.risk} ${counts.risk === 1 ? "document is" : "documents are"} flagged — those come first.`
        : counts.warn > 0
          ? `${counts.warn} ${counts.warn === 1 ? "document has" : "documents have"} not been read yet. Open the oldest and work forward.`
          : "Every document here has been reviewed. Nothing is waiting on you.";

  return (
    <ExplainScreen
      explain={{
        title: "Evidence",
        what: "Every document in the file, shown as a tile with what kind of thing it is and whether anyone has actually looked at it yet.",
        where,
        next,
        action: nextDoc ? (
          <PrimaryAction
            label={`Open “${nextDoc.title}”`}
            icon={FileText}
            onClick={() => handleOpen(nextDoc)}
          />
        ) : undefined,
      }}
    >
      <EvidenceView
        documents={documents}
        entityName={entityName}
        onOpen={handleOpen}
        selectedId={selectedId}
      />
    </ExplainScreen>
  );
}
