import { useEffect, useState } from "react";
import { bus } from "@/bus";
import { getDataProvider, type Document, type Item } from "@/data";
import { getVocabulary } from "@/config";
import { useLayout } from "@/shell/layout-context";
import { usePanelScope } from "@/shell/panel-scope";
import { Separator } from "@/components/ui/separator";
import { Table, FolderOpen } from "lucide-react";
import { Chip, ExplainScreen, PrimaryAction, SecondaryAction, humanizeStatus, statusTone } from "./explain";

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

  // Explain-first: even the reader gets the block. "What am I looking at and why
  // is it open" is exactly the question a dropped-in reader has (ruling 2026-08-10).
  if (!document && !item) {
    const itemTableOpen = isPanelVisible("ItemTable");
    const docBrowserOpen = isPanelVisible("DocBrowser");
    return (
      <ExplainScreen
        explain={{
          title: "Reader",
          what: `The full text of whatever you click — a ${vocab.item.toLowerCase()} or a document — with nothing summarised away.`,
          where: "Nothing is open in the reader yet.",
          next:
            itemTableOpen || docBrowserOpen
              ? `Click a ${vocab.item.toLowerCase()} or a document tile and it opens here.`
              : "Open the evidence or the timeline, then click something in it.",
          action:
            itemTableOpen && docBrowserOpen ? undefined : (
              <>
                {!docBrowserOpen && (
                  <PrimaryAction
                    label="Open the evidence"
                    icon={FolderOpen}
                    onClick={() => openPanel("DocBrowser")}
                  />
                )}
                {!itemTableOpen && (
                  <SecondaryAction
                    label={`Open ${vocab.itemPlural}`}
                    icon={Table}
                    onClick={() => openPanel("ItemTable")}
                  />
                )}
              </>
            ),
        }}
      >
        <p className="p-4 text-[13px] text-muted-foreground">
          Nothing is open in the reader.
        </p>
      </ExplainScreen>
    );
  }

  if (item && !document) {
    return (
      <ExplainScreen
        explain={{
          title: item.title,
          what: `One ${vocab.item.toLowerCase()} from the record, in full. This is the raw entry, not a summary of it.`,
          where: (
            <span className="inline-flex flex-wrap items-center gap-1.5">
              Recorded {item.date}
              {item.type ? ` · ${item.type}` : ""}
              {item.status ? (
                <Chip label={humanizeStatus(item.status)} tone={statusTone(item.status)} />
              ) : null}
            </span>
          ),
          next: item.evidenceSource
            ? "Check the source line below against the document it points at."
            : `Go back to ${vocab.itemPlural.toLowerCase()} for what came before and after this.`,
        }}
      >
        <div className="p-6 max-w-prose">
          <p className="text-sm leading-relaxed text-foreground/90 font-serif">{item.summary}</p>
          {item.evidenceSource && (
            <>
              <Separator className="my-4" />
              <p className="text-[12px] text-muted-foreground">
                Source: <span className="font-mono">{item.evidenceSource}</span>
              </p>
            </>
          )}
        </div>
      </ExplainScreen>
    );
  }

  if (document) {
    return (
      <ExplainScreen
        explain={{
          title: document.title,
          what: "One document from the file, in full, section by section. Nothing here is paraphrased.",
          where: (
            <span className="inline-flex flex-wrap items-center gap-1.5">
              {document.category}
              {document.createdAt ? ` · filed ${document.createdAt.slice(0, 10)}` : ""}
              {document.status ? (
                <Chip label={humanizeStatus(document.status)} tone={statusTone(document.status)} />
              ) : null}
            </span>
          ),
          next:
            document.sections.length > 1
              ? `Read the ${document.sections.length} sections below, or jump straight to a section from a cited answer.`
              : "Read it below, then go back to the evidence for the next one.",
        }}
      >
        <div className="p-6 max-w-prose">
          {document.sections.map((section) => (
            <div key={section.id} id={`section-${section.id}`} className="mb-6">
              <h3 className="text-sm font-semibold tracking-tight mb-2">{section.title}</h3>
              <div className="text-sm leading-relaxed text-foreground/90 font-serif whitespace-pre-wrap">
                {section.content}
              </div>
            </div>
          ))}
        </div>
      </ExplainScreen>
    );
  }

  return null;
}
