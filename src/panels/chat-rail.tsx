import { useEffect, useState, useRef } from "react";
import { bus, type ChatContextEvent } from "@/bus";
import { getConfig } from "@/config";
import { useLayout } from "@/shell/layout-context";
import { usePanelScope } from "@/shell/panel-scope";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, Link } from "lucide-react";
import { EdHeader, EdPill, Eyebrow, FigBox, QuietChip, SourceChip } from "./editorial-kit";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Citation {
  label: string;
  docId: string;
  sectionId: string;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
  context: ChatContextEvent | null;
  citations?: Citation[];
}

async function sendMessage(context: ChatContextEvent | null, _text: string): Promise<{ reply: string; citations: Citation[] }> {
  await new Promise((r) => setTimeout(r, 600));

  const contextStr = context?.entityName
    ? `Regarding ${context.entityName}${context.itemTitle ? ` / ${context.itemTitle}` : ""}: `
    : "";

  return {
    reply: `${contextStr}Based on the available information, I can help with that. The relevant details have been reviewed and the recommended next steps are outlined in the associated documentation.`,
    citations: [
      { label: "Care Plan Summary § Overview", docId: "d1", sectionId: "s1" },
      { label: "Lab Results § HbA1c", docId: "d3", sectionId: "s13" },
    ],
  };
}

/**
 * ASK — the record answers.
 *
 * D-LDUX-5 restyles the answer as an editorial card rather than a chat bubble:
 * a mono eyebrow saying who is speaking, the answer in Fraunces prose at reading
 * size, any figures lifted out into boxes so they can be seen without being
 * hunted for, and the citations as source chips that open the record behind
 * them.
 *
 * The honesty case gets its own treatment. When the answer is that the record
 * does not hold the answer, the card goes sage-soft and says so in the eyebrow —
 * "the record does not say" is a finding, and it must not look like a failure or
 * hide inside a paragraph.
 */

const NO_ANSWER =
  /\b(the record (does not|doesn'?t) (say|hold|show|contain)|not in the record|no record of|nothing in the record|is silent|cannot be answered from|no (entry|document|evidence) (for|about))\b/i;

const FIGURE = /(\$\s?[\d,]+(?:\.\d+)?|\b\d+(?:\.\d+)?\s?%|\b\d{1,3}(?:,\d{3})+\b|\b\d+(?:\.\d+)?\s?(?:days?|weeks?|months?|years?|hours?)\b)/gi;

/** Figures pulled out of the prose, each labelled by the words that introduce it
 *  and titled with the sentence it came from, so nothing is quoted out of its
 *  context. Cheap, and it never invents a number the answer did not contain. */
export function extractFigures(text: string): { value: string; label: string; sentence: string }[] {
  const out: { value: string; label: string; sentence: string }[] = [];
  const seen = new Set<string>();
  for (const sentence of text.split(/(?<=[.!?])\s+/)) {
    for (const match of sentence.matchAll(FIGURE)) {
      const value = match[0].trim();
      if (seen.has(value)) continue;
      seen.add(value);
      const before = sentence.slice(0, match.index ?? 0).trim().split(/\s+/).slice(-4).join(" ");
      out.push({
        value,
        label: before.replace(/[^\w\s%$.-]/g, "").trim() || "in the answer",
        sentence: sentence.trim(),
      });
      if (out.length >= 3) return out;
    }
  }
  return out;
}

export function ChatRailPanel() {
  const config = getConfig();
  const { tab } = usePanelScope();
  const { getTabsByType, setScopeForTab } = useLayout();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [context, setContext] = useState<ChatContextEvent | null>(null);
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const scopeId = tab.scopeId ?? null;
  const entityLists = getTabsByType("EntityList");
  const followingLabel = scopeId
    ? entityLists.find((el) => el.id === scopeId)?.title ?? "Scope"
    : "Any";

  useEffect(() => {
    setContext(null);
  }, [scopeId]);

  useEffect(() => {
    return bus.onScoped("chat.context", scopeId, setContext);
  }, [scopeId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async (text?: string) => {
    const msg = text ?? input;
    if (!msg.trim()) return;

    const userMessage: Message = {
      id: `msg_${Date.now()}`,
      role: "user",
      text: msg.trim(),
      context,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    const response = await sendMessage(context, msg.trim());

    const assistantMessage: Message = {
      id: `msg_${Date.now()}_reply`,
      role: "assistant",
      text: response.reply,
      context,
      citations: response.citations,
    };

    setMessages((prev) => [...prev, assistantMessage]);
    setLoading(false);
  };

  const handleCitationClick = (citation: Citation) => {
    const emitScope = scopeId ?? tab.id;
    bus.emit("doc.open", { scopeId: emitScope, docId: citation.docId, docTitle: citation.label });
    bus.emit("doc.section", { scopeId: emitScope, docId: citation.docId, sectionId: citation.sectionId });
  };

  const entity = getConfig().vocabulary.entity.toLowerCase();

  return (
    <div className="ed-motion flex h-full min-h-0 flex-col bg-ed-paper text-ed-ink">
      {/* Explain-first (ruling 2026-08-10). The Ask rail keeps its visual primacy
          from D-LDUX-1; this block tells a first-time reader what it is FOR. */}
      <EdHeader
        eyebrow="Ask"
        title="Put a question to the record"
        what={`Ask a plain question about this ${entity} and get an answer back with the exact part of the record it came from.`}
        where={
          context?.entityName ? (
            <>
              Answering about <span className="text-ed-ink">{context.entityName}</span>
              {context.itemTitle ? <> › {context.itemTitle}</> : null}.
            </>
          ) : (
            `Nothing is selected, so answers will not be tied to one ${entity}.`
          )
        }
        next={
          messages.length === 0
            ? "Type a question below, or start with one of the suggestions."
            : "Click any source under an answer to open the record behind it."
        }
      />

      <div className="flex items-center gap-2 border-b border-ed-rule bg-ed-card px-4 py-1.5">
        {context?.entityName ? (
          <EdPill
            label={`${context.entityName}${context.itemTitle ? ` › ${context.itemTitle}` : ""}`}
            tone="ok"
          />
        ) : (
          <Eyebrow>No selection</Eyebrow>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="ed-focus ed-mono ml-auto flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] uppercase tracking-[0.05em] text-ed-muted transition-colors duration-150 hover:text-ed-ink">
              <Link className="h-3 w-3" />
              {followingLabel}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem
              onClick={() => setScopeForTab(tab.id, undefined)}
              className="text-xs"
            >
              Any (auto)
              {!scopeId && <span className="ml-auto text-[10px] text-muted-foreground">*</span>}
            </DropdownMenuItem>
            {entityLists.map((el) => (
              <DropdownMenuItem
                key={el.id}
                onClick={() => setScopeForTab(tab.id, el.id)}
                className="text-xs"
              >
                {el.title}
                {scopeId === el.id && <span className="ml-auto text-[10px] text-muted-foreground">*</span>}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <ScrollArea className="flex-1">
        <div ref={scrollRef} className="space-y-4 p-4">
          {messages.length === 0 && (
            <div className="space-y-2 pt-2">
              <Eyebrow tick>Start here</Eyebrow>
              <div className="space-y-2">
                {config.chat.suggestedQuestions.map((q) => (
                  <QuietChip key={q} label={q} onClick={() => handleSend(q)} />
                ))}
              </div>
            </div>
          )}

          {messages.map((msg) =>
            msg.role === "user" ? (
              <div key={msg.id} className="pl-6">
                <Eyebrow>You asked</Eyebrow>
                <p className="ed-serif mt-1 text-[15px] leading-[1.6] text-ed-ink">{msg.text}</p>
              </div>
            ) : (
              <AnswerCard key={msg.id} message={msg} onCitation={handleCitationClick} />
            )
          )}

          {loading && (
            <div className="rounded-[12px] border border-ed-rule bg-ed-card px-4 py-3">
              <Eyebrow>Reading the record</Eyebrow>
              <div className="mt-2 flex gap-1">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ed-sage" />
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ed-sage [animation-delay:150ms]" />
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ed-sage [animation-delay:300ms]" />
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      <div className="border-t border-ed-rule bg-ed-card p-3">
        <form
          onSubmit={(e) => { e.preventDefault(); handleSend(); }}
          className="flex items-center gap-2"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question…"
            aria-label="Ask a question about the record"
            disabled={loading}
            className="ed-focus ed-serif h-9 flex-1 rounded-full border border-ed-rule bg-ed-paper px-4 text-[14.5px] text-ed-ink placeholder:text-ed-muted disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            aria-label="Send the question"
            className="ed-focus flex h-9 w-9 items-center justify-center rounded-full bg-ed-sage text-white transition-[filter] duration-150 hover:brightness-110 disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  );
}

/** THE RECORD ANSWERS — one answer, as an editorial card. */
function AnswerCard({
  message,
  onCitation,
}: {
  message: Message;
  onCitation: (c: Citation) => void;
}) {
  const honest = NO_ANSWER.test(message.text);
  const figures = honest ? [] : extractFigures(message.text);

  return (
    <article
      className={`rounded-[12px] border px-4 py-3.5 ${
        honest ? "border-ed-sage/40 bg-ed-sage-soft" : "border-ed-rule bg-ed-card"
      }`}
    >
      <Eyebrow tick>{honest ? "The record does not say" : "The record answers"}</Eyebrow>

      <p className="ed-serif mt-2 text-[15.5px] leading-[1.65] text-ed-ink">{message.text}</p>

      {figures.length > 0 && (
        <div className="mt-3 grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(120px,1fr))]">
          {figures.map((f) => (
            <span key={f.value} title={f.sentence}>
              <FigBox value={f.value} label={f.label} />
            </span>
          ))}
        </div>
      )}

      {message.citations && message.citations.length > 0 && (
        <div className="mt-3 border-t border-ed-rule pt-2.5">
          <Eyebrow>Where this came from</Eyebrow>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {message.citations.map((c) => (
              <SourceChip
                key={c.sectionId}
                label={c.label}
                onOpen={() => onCitation(c)}
                title={`Open ${c.label} in the reader`}
              />
            ))}
          </div>
        </div>
      )}
    </article>
  );
}
