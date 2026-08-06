import { useEffect, useState, useRef } from "react";
import { bus, type ChatContextEvent } from "@/bus";
import { getConfig } from "@/config";
import { useLayout } from "@/shell/layout-context";
import { usePanelScope } from "@/shell/panel-scope";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Send, Link } from "lucide-react";
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
      { label: "Care Plan Summary \u00A7 Overview", docId: "d1", sectionId: "s1" },
      { label: "Lab Results \u00A7 HbA1c", docId: "d3", sectionId: "s13" },
    ],
  };
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

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
        {context?.entityName ? (
          <Badge variant="secondary" className="text-[10px]">
            {context.entityName}
            {context.itemTitle && ` \u203A ${context.itemTitle}`}
          </Badge>
        ) : (
          <span className="text-[10px] text-muted-foreground">No selection</span>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground transition-colors">
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
        <div ref={scrollRef} className="p-3 space-y-3">
          {messages.length === 0 && (
            <div className="space-y-2 pt-4">
              <p className="text-xs text-muted-foreground text-center mb-3">Ask a question to get started</p>
              {config.chat.suggestedQuestions.map((q) => (
                <button
                  key={q}
                  onClick={() => handleSend(q)}
                  className="w-full rounded border border-border px-3 py-2 text-left text-xs text-foreground hover:bg-accent/50 transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          )}
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`rounded px-3 py-2 text-sm ${
                msg.role === "user"
                  ? "bg-accent/50 ml-4"
                  : "bg-muted mr-4"
              }`}
            >
              <p className="text-xs leading-relaxed">{msg.text}</p>
              {msg.citations && msg.citations.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {msg.citations.map((c) => (
                    <button
                      key={c.sectionId}
                      onClick={() => handleCitationClick(c)}
                      className="rounded bg-card border border-border px-2 py-0.5 text-[10px] text-muted-foreground hover:text-foreground hover:border-ring/50 transition-colors"
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
          {loading && (
            <div className="bg-muted mr-4 rounded px-3 py-2">
              <div className="flex gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50 animate-pulse" />
                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50 animate-pulse [animation-delay:150ms]" />
                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50 animate-pulse [animation-delay:300ms]" />
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
      <div className="border-t border-border p-2">
        <form
          onSubmit={(e) => { e.preventDefault(); handleSend(); }}
          className="flex items-center gap-2"
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question..."
            className="h-7 text-xs flex-1"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="flex h-7 w-7 items-center justify-center rounded bg-primary text-primary-foreground disabled:opacity-50"
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </form>
      </div>
    </div>
  );
}
