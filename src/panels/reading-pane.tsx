import { useEffect, useState } from "react";
import { bus } from "@/bus";
import { getDataProvider, type Document, type Item } from "@/data";
import { getVocabulary } from "@/config";
import { useLayout } from "@/shell/layout-context";
import { usePanelScope } from "@/shell/panel-scope";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Table, FolderOpen } from "lucide-react";

export function ReadingPanePanel() {
  const vocab = getVocabulary();
  const { isPanelVisible, openPanel } = useLayout();
  const { tab } = usePanelScope();
  const [document, setDocument] = useState<Document | null>(null);
  const [item, setItem] = useState<Item | null>(null);
  const [scrollToSection, setScrollToSection] = useState<string | null>(null);

  const scopeId = tab.scopeId ?? null;

  useEffect(() => {
    setDocument(null);
    setItem(null);
  }, [scopeId]);

  useEffect(() => {
    const unsub1 = bus.onScoped("item.selected", scopeId, async (event) => {
      const provider = getDataProvider();
      const items = await provider.listItems(event.entityId);
      const found = items.find((i) => i.id === event.itemId);
      setItem(found ?? null);
      setDocument(null);
    });

    const unsub2 = bus.onScoped("doc.open", scopeId, async (event) => {
      const doc = await getDataProvider().getDocument(event.docId);
      setDocument(doc);
      setItem(null);
    });

    const unsub3 = bus.onScoped("doc.section", scopeId, (event) => {
      setScrollToSection(event.sectionId);
    });

    return () => { unsub1(); unsub2(); unsub3(); };
  }, [scopeId]);

  useEffect(() => {
    if (scrollToSection) {
      const el = window.document.getElementById(`section-${scrollToSection}`);
      if (el) el.scrollIntoView({ behavior: "smooth" });
      setScrollToSection(null);
    }
  }, [scrollToSection]);

  if (!document && !item) {
    const itemTableOpen = isPanelVisible("ItemTable");
    const docBrowserOpen = isPanelVisible("DocBrowser");
    return (
      <div className="flex h-full items-center justify-center p-4">
        <div className="text-center space-y-3">
          <p className="text-sm text-muted-foreground">
            {itemTableOpen || docBrowserOpen
              ? `Select an ${vocab.item.toLowerCase()} or document to view it here.`
              : `Open a panel to browse content.`
            }
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {!itemTableOpen && (
              <button
                onClick={() => openPanel("ItemTable")}
                className="inline-flex items-center gap-1.5 rounded border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent transition-colors"
              >
                <Table className="h-3.5 w-3.5" />
                Open {vocab.itemPlural}
              </button>
            )}
            {!docBrowserOpen && (
              <button
                onClick={() => openPanel("DocBrowser")}
                className="inline-flex items-center gap-1.5 rounded border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent transition-colors"
              >
                <FolderOpen className="h-3.5 w-3.5" />
                Open Documents
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (item && !document) {
    return (
      <ScrollArea className="h-full">
        <div className="p-6 max-w-prose">
          <h2 className="text-xl font-semibold tracking-tight font-serif">{item.title}</h2>
          <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="font-mono tabular-nums">{item.date}</span>
            <span>{item.type}</span>
            <span>{item.status}</span>
          </div>
          <Separator className="my-4" />
          <p className="text-sm leading-relaxed text-foreground/90 font-serif">{item.summary}</p>
        </div>
      </ScrollArea>
    );
  }

  if (document) {
    return (
      <ScrollArea className="h-full">
        <div className="p-6 max-w-prose">
          <h2 className="text-xl font-semibold tracking-tight font-serif">{document.title}</h2>
          <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
            <span>{document.category}</span>
            <span className="font-mono tabular-nums">{document.createdAt}</span>
          </div>
          <Separator className="my-4" />
          {document.sections.map((section) => (
            <div key={section.id} id={`section-${section.id}`} className="mb-6">
              <h3 className="text-sm font-semibold tracking-tight mb-2">{section.title}</h3>
              <div className="text-sm leading-relaxed text-foreground/90 font-serif whitespace-pre-wrap">
                {section.content}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    );
  }

  return null;
}
