import { useEffect, useState } from "react";
import { bus } from "@/bus";
import { getDataProvider, type Document, type Item } from "@/data";
import { getVocabulary } from "@/config";
import { useLayout } from "@/shell/layout-context";
import { usePanelScope } from "@/shell/panel-scope";
import { Table, FolderOpen } from "lucide-react";
import {
  EdButton,
  EdEmpty,
  EdPill,
  EdScreen,
  Eyebrow,
  edTone,
  humanize,
} from "./editorial-kit";

/**
 * THE READER — the full text of whatever was clicked.
 *
 * D-LDUX-5 sets it in the editorial face, because this is where a chronology
 * fact card and an evidence tile both land: a reader arriving from a fact must
 * not feel they changed products halfway through a thought. One column, ~72ch,
 * Fraunces at reading size, provenance in mono. Nothing here is summarised, and
 * that has not changed — only the type has.
 */
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

  const one = vocab.item.toLowerCase();

  // Explain-first: even the reader gets the block. "What am I looking at and why
  // is it open" is exactly the question a dropped-in reader has (ruling 2026-08-10).
  if (!document && !item) {
    const itemTableOpen = isPanelVisible("ItemTable");
    const docBrowserOpen = isPanelVisible("DocBrowser");
    return (
      <EdScreen
        header={{
          eyebrow: "Reader",
          title: "Nothing is open yet",
          what: `The full text of whatever you click — one ${one}, or one document — with nothing summarised away.`,
          where: "Nothing is open in the reader yet.",
          next:
            itemTableOpen || docBrowserOpen
              ? `Click any ${one} or document tile and it opens here.`
              : `Open the evidence or the ${vocab.itemPlural.toLowerCase()}, then click something in it.`,
          action:
            itemTableOpen && docBrowserOpen ? undefined : (
              <>
                {!docBrowserOpen && (
                  <EdButton
                    label="Open the evidence"
                    icon={FolderOpen}
                    onClick={() => openPanel("DocBrowser")}
                  />
                )}
                {!itemTableOpen && (
                  <EdButton
                    variant="quiet"
                    label={`Open ${vocab.itemPlural}`}
                    icon={Table}
                    onClick={() => openPanel("ItemTable")}
                  />
                )}
              </>
            ),
        }}
      >
        <EdEmpty
          line="Nothing is open in the reader."
          hint="Whatever you click elsewhere lands here, in full."
        />
      </EdScreen>
    );
  }

  if (item && !document) {
    return (
      <EdScreen
        header={{
          eyebrow: one,
          title: humanize(item.title) || item.title,
          meta: item.date ? item.date.slice(0, 10) : undefined,
          pills: (
            <>
              {item.type && (
                <EdPill
                  label={item.type}
                  tone="ok"
                  title="Who or what the record attributes this to"
                />
              )}
              {item.status && <EdPill label={humanize(item.status)} tone={edTone(item.status)} />}
              {item.statute && (
                <EdPill label={item.statute} tone="gold" title="Statute cited on this entry" />
              )}
            </>
          ),
          what: `One ${one} from the record, in full. This is the raw entry, not a summary of it.`,
          where: item.date
            ? `Recorded ${item.date.slice(0, 10)}.`
            : "No date is recorded on this entry.",
          next: item.evidenceSource
            ? "Check the source line below against the document it points at."
            : `Go back to the ${vocab.itemPlural.toLowerCase()} for what came before and after this.`,
        }}
      >
        <div className="max-w-[72ch] px-6 py-6">
          <p className="ed-serif text-[16px] leading-[1.65] whitespace-pre-wrap text-ed-ink">
            {item.summary || "The entry carries no description."}
          </p>
          {item.evidenceSource && (
            <div className="mt-6 border-t border-ed-rule pt-3">
              <Eyebrow>Source</Eyebrow>
              <p className="ed-mono mt-1 text-[12px] break-words text-ed-muted">
                {item.evidenceSource}
              </p>
            </div>
          )}
        </div>
      </EdScreen>
    );
  }

  if (document) {
    return (
      <EdScreen
        header={{
          eyebrow: "Document",
          title: document.title,
          meta: document.createdAt ? `filed ${document.createdAt.slice(0, 10)}` : undefined,
          pills: (
            <>
              {document.category && <EdPill label={humanize(document.category)} tone="neutral" />}
              {document.status && (
                <EdPill label={humanize(document.status)} tone={edTone(document.status)} />
              )}
            </>
          ),
          what: "One document from the file, in full, section by section. Nothing here is paraphrased.",
          where: `${document.sections.length} ${
            document.sections.length === 1 ? "section" : "sections"
          } in this document.`,
          next:
            document.sections.length > 1
              ? "Read the sections below, or jump straight to one from a cited answer."
              : "Read it below, then go back to the evidence for the next one.",
        }}
      >
        <div className="max-w-[72ch] px-6 py-6">
          {document.sections.map((section) => (
            <section key={section.id} id={`section-${section.id}`} className="mb-8">
              <Eyebrow tick>{section.title}</Eyebrow>
              <div className="ed-serif mt-2 text-[16px] leading-[1.65] whitespace-pre-wrap text-ed-ink">
                {section.content}
              </div>
            </section>
          ))}
        </div>
      </EdScreen>
    );
  }

  return null;
}
