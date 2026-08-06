import { useEffect, useState } from "react";
import { bus } from "@/bus";
import { getDataProvider, type Document } from "@/data";
import { usePanelScope } from "@/shell/panel-scope";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileText, FolderOpen } from "lucide-react";

export function DocBrowserPanel() {
  const { tab } = usePanelScope();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const scopeId = tab.scopeId ?? null;

  useEffect(() => {
    getDataProvider().listDocuments().then(setDocuments);
  }, []);

  useEffect(() => {
    setSelectedId(null);
  }, [scopeId]);

  const categories = [...new Set(documents.map((d) => d.category))];

  const handleSelect = (doc: Document) => {
    setSelectedId(doc.id);
    const emitScope = scopeId ?? tab.id;
    bus.emit("doc.open", { scopeId: emitScope, docId: doc.id, docTitle: doc.title });
  };

  if (documents.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <p className="text-sm text-muted-foreground">Loading documents...</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-2">
        {categories.map((category) => (
          <div key={category} className="mb-3">
            <div className="flex items-center gap-1.5 px-2 py-1">
              <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {category}
              </span>
            </div>
            <div className="space-y-0.5">
              {documents
                .filter((d) => d.category === category)
                .map((doc) => (
                  <button
                    key={doc.id}
                    onClick={() => handleSelect(doc)}
                    className={`
                      w-full flex items-center gap-2 rounded px-2 py-1.5 text-left transition-colors
                      ${selectedId === doc.id ? "bg-accent text-accent-foreground" : "hover:bg-accent/50"}
                    `}
                  >
                    <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium">{doc.title}</p>
                      <p className="text-[10px] text-muted-foreground font-mono">{doc.createdAt}</p>
                    </div>
                  </button>
                ))}
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
