import { useEffect, useMemo, useState } from "react";
import { bus } from "@/bus";
import { getDataProvider, type Document, type Item, type Metric, type Stage } from "@/data";
import { getConfig, getVocabulary, type PanelType } from "@/config";
import { useLayout } from "@/shell/layout-context";
import { usePanelScope } from "@/shell/panel-scope";
import {
  MessageSquare,
  FileText,
  Clock,
  ListChecks,
  Users,
  Gavel,
  Banknote,
  Receipt,
  Table,
  ArrowRight,
  List,
} from "lucide-react";
import {
  CardGrid,
  Chip,
  ExplainScreen,
  PrimaryAction,
  ProgressStrip,
  SecondaryAction,
  SectionCard,
  statusTone,
  type Step,
  type Tone,
} from "./explain";

/**
 * MATTER HOME — the "where am I / what do I do next" screen.
 *
 * Reading order is fixed by ruling (Dave, 2026-08-10) and is the whole point of
 * the screen:
 *
 *   1. the explainer + orientation strip  (what this is, where you are, next)
 *   2. the card grid                      (plain-English sections, counts, chips)
 *   3. the dense panel                    (the numbers, last)
 *
 * Nothing dense may be hoisted above the block. If a future panel wants to be
 * first, the answer is no — it goes in the grid or under it.
 */

interface CardSpec {
  panel: PanelType;
  title: string;
  description: string;
  icon: typeof FileText;
  tone: Tone;
  action: string;
  count?: number | string;
  countLabel?: string;
  chips?: React.ReactNode;
  emphasis?: boolean;
}

function toSteps(stages: Stage[]): Step[] {
  return stages.map((s) => ({
    id: s.id,
    label: s.name,
    state: s.state,
    detail: s.detail,
  }));
}

/** The plain-English sentence for "where you are", read off the stages. */
function whereLine(stages: Stage[]): string {
  const blocked = stages.find((s) => s.state === "blocked");
  if (blocked) return `Blocked at “${blocked.name}”${blocked.detail ? ` — ${blocked.detail}` : ""}.`;
  const current = stages.find((s) => s.state === "current");
  if (current) return `In “${current.name}”${current.detail ? ` — ${current.detail}` : ""}.`;
  const done = stages.filter((s) => s.state === "done").length;
  if (stages.length > 0 && done === stages.length) return "Every recorded stage is finished.";
  if (stages.length === 0) return "No stages recorded yet, so there is nothing to be behind on.";
  return "Not started — the first stage is still open.";
}

/** The plain-English sentence for "do next". Evidence that nobody has read is
 *  the loudest thing there is, so it wins over stage posture when present. */
function nextLine(stages: Stage[], docs: Document[], openish: number): string {
  const flagged = docs.filter((d) => statusTone(d.status) === "risk").length;
  if (flagged > 0) {
    return `${flagged} ${flagged === 1 ? "document is" : "documents are"} flagged. Look at those first.`;
  }
  if (openish > 0) {
    return `${openish} ${openish === 1 ? "document has" : "documents have"} not been read by anyone yet. Review them.`;
  }
  const blocked = stages.find((s) => s.state === "blocked");
  if (blocked) return `Clear whatever is holding up “${blocked.name}”.`;
  const current = stages.find((s) => s.state === "current");
  if (current) return `Finish “${current.name}”, then move to the next stage.`;
  return "Nothing is waiting on you. Ask a question if you want to test the record.";
}

export function MatterHomePanel() {
  const vocab = getVocabulary();
  const registered = getConfig().panels ?? [];
  const { tab } = usePanelScope();
  const { openPanel, isPanelVisible } = useLayout();

  const [entityId, setEntityId] = useState<string | null>(null);
  const [entityName, setEntityName] = useState<string | null>(null);
  const [stages, setStages] = useState<Stage[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [docs, setDocs] = useState<Document[]>([]);
  const [metrics, setMetrics] = useState<Metric[]>([]);

  const scopeId = tab.scopeId ?? null;

  useEffect(() => {
    setEntityId(null);
    setEntityName(null);
    setStages([]);
    setItems([]);
    setMetrics([]);
  }, [scopeId]);

  useEffect(() => {
    return bus.onScoped("entity.selected", scopeId, (event) => {
      setEntityId(event.entityId);
      setEntityName(event.entityName);
    });
  }, [scopeId]);

  useEffect(() => {
    if (!entityId) return;
    let cancelled = false;
    const provider = getDataProvider();
    // Each read is independent; one failing must not blank the whole screen.
    provider.getStages(entityId).then((s) => !cancelled && setStages(s)).catch(() => {});
    provider.listItems(entityId).then((i) => !cancelled && setItems(i)).catch(() => {});
    provider.getMetrics(entityId).then((m) => !cancelled && setMetrics(m)).catch(() => {});
    provider.listDocuments().then((d) => !cancelled && setDocs(d)).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [entityId]);

  const docCounts = useMemo(() => {
    let good = 0;
    let warn = 0;
    let risk = 0;
    for (const d of docs) {
      const tone = statusTone(d.status);
      if (tone === "good") good += 1;
      else if (tone === "risk") risk += 1;
      else warn += 1;
    }
    return { good, warn, risk };
  }, [docs]);

  const one = vocab.entity.toLowerCase();

  const go = (panel: PanelType) => () => {
    if (!isPanelVisible(panel)) openPanel(panel);
    // Re-announcing the selection makes the panel that just opened catch up; it
    // was not mounted when the original entity.selected went out.
    if (entityId && entityName) {
      bus.emit("entity.selected", { scopeId: scopeId ?? tab.id, entityId, entityName });
    }
  };

  if (!entityName) {
    const listOpen = isPanelVisible("EntityList");
    return (
      <ExplainScreen
        explain={{
          title: `${vocab.entity} home`,
          what: `One page per ${one}: where it stands, what is in it, and what to do next. Everything else in the workspace is a detail of this page.`,
          where: `No ${one} is open yet.`,
          next: listOpen
            ? `Pick a ${one} from the ${vocab.entityPlural} list and this page fills in.`
            : `The ${vocab.entityPlural} list is closed. Open it and pick a ${one}.`,
          action: listOpen ? undefined : (
            <PrimaryAction
              label={`Open ${vocab.entityPlural}`}
              icon={List}
              onClick={() => openPanel("EntityList")}
            />
          ),
        }}
      >
        <div className="p-4">
          <p className="text-[13px] text-muted-foreground">
            Nothing to show until a {one} is chosen.
          </p>
        </div>
      </ExplainScreen>
    );
  }

  const unread = docCounts.warn;

  // Cards are offered only for panels this profile actually registers, so the
  // healthcare demo does not advertise subpoenas.
  const allCards: CardSpec[] = [
    {
      panel: "ChatRail",
      title: "Ask about this " + one,
      description: `Ask a plain question and get an answer with the record it came from. This is the fastest way into anything below.`,
      icon: MessageSquare,
      tone: "info",
      action: "Ask a question",
      emphasis: true,
    },
    {
      panel: "DocBrowser",
      title: "Evidence",
      description: "Every document, and whether anyone has actually looked at it yet.",
      icon: FileText,
      tone: docCounts.risk > 0 ? "risk" : unread > 0 ? "warn" : "good",
      action: "Open the evidence",
      count: docs.length,
      countLabel: docs.length === 1 ? "document" : "documents",
      chips: (
        <>
          {docCounts.good > 0 && <Chip label="Reviewed" tone="good" count={docCounts.good} />}
          {unread > 0 && <Chip label="Pending" tone="warn" count={unread} />}
          {docCounts.risk > 0 && <Chip label="Flagged" tone="risk" count={docCounts.risk} />}
        </>
      ),
    },
    {
      panel: "ItemTable",
      title: vocab.itemPlural,
      description: `What happened and when, in order. Click any line to read it in full.`,
      icon: Clock,
      tone: "neutral",
      action: `Open the ${vocab.itemPlural.toLowerCase()}`,
      count: items.length,
      countLabel: items.length === 1 ? "entry" : "entries",
    },
    {
      panel: "StageTracker",
      title: "Where things stand",
      description: "The stages this matter moves through, and which one it is sitting in.",
      icon: ListChecks,
      tone: stages.some((s) => s.state === "blocked") ? "risk" : "neutral",
      action: "Open the stages",
      count: stages.length,
      countLabel: stages.length === 1 ? "stage" : "stages",
    },
    {
      panel: "Parties",
      title: "People",
      description: "Who is on each side, and which lawyer speaks for them.",
      icon: Users,
      tone: "neutral",
      action: "Open the people",
    },
    {
      panel: "Subpoenas",
      title: "Records we asked for",
      description: "Subpoenas out the door: what each one gets and whether it came back.",
      icon: Gavel,
      tone: "neutral",
      action: "Open the subpoenas",
    },
    {
      panel: "RecoveryOutlook",
      title: "What this could be worth",
      description: "The current recovery range and the arithmetic behind it.",
      icon: Banknote,
      tone: "good",
      action: "Open the outlook",
    },
    {
      panel: "ClaimValue",
      title: "Claim by claim",
      description: "Each claim priced on its own, with the line items that make it up.",
      icon: Receipt,
      tone: "neutral",
      action: "Open the claim values",
    },
    {
      panel: "CoverageMatrix",
      title: "What has not been examined",
      description: "A screen, not a verdict: which documents nothing in the record points at.",
      icon: Table,
      tone: "warn",
      action: "Open the coverage screen",
    },
  ];

  const cards = allCards.filter(
    (c) => registered.length === 0 || registered.includes(c.panel)
  );

  return (
    <ExplainScreen
      explain={{
        title: entityName,
        what: `Everything about this ${one} in one place. Each card below opens the detail behind it; nothing here needs you to know where it is stored.`,
        where: whereLine(stages),
        next: nextLine(stages, docs, unread),
        orientation: <ProgressStrip steps={toSteps(stages)} />,
        action: (
          <>
            <PrimaryAction
              label={`Ask about this ${one}`}
              icon={MessageSquare}
              onClick={go("ChatRail")}
            />
            {(docCounts.risk > 0 || unread > 0) && (
              <SecondaryAction
                label={docCounts.risk > 0 ? "See the flagged evidence" : "Review pending evidence"}
                icon={FileText}
                onClick={go("DocBrowser")}
              />
            )}
          </>
        ),
      }}
    >
      {/* 2 — the card grid */}
      <CardGrid>
        {cards.map((c) => (
          <SectionCard
            key={c.panel}
            title={c.title}
            description={c.description}
            icon={c.icon}
            tone={c.tone}
            count={c.count}
            countLabel={c.countLabel}
            chips={c.chips}
            actionLabel={c.action}
            emphasis={c.emphasis}
            onOpen={go(c.panel)}
          />
        ))}
      </CardGrid>

      {/* 3 — the dense panel, last */}
      {metrics.length > 0 && (
        <section className="border-t border-border px-4 py-3">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-[13px] font-medium text-foreground">The numbers</h3>
            <span className="text-[11px] text-muted-foreground">
              Counted from the record, not estimated
            </span>
          </div>
          <div className="mt-2.5 grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(150px,1fr))]">
            {metrics.map((m) => (
              <div key={m.id} className="rounded-md border border-border bg-card px-3 py-2">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {m.label}
                </p>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="font-mono text-[18px] font-semibold tabular-nums">
                    {m.value}
                  </span>
                  {m.delta && (
                    <span className="font-mono text-[11px] text-muted-foreground">{m.delta}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
          {isPanelVisible("MetricGrid") ? null : (
            <button
              type="button"
              onClick={go("MetricGrid")}
              className="mt-2.5 inline-flex items-center gap-1 text-[12px] font-medium text-muted-foreground hover:text-foreground"
            >
              Open the full metrics panel <ArrowRight className="h-3.5 w-3.5" />
            </button>
          )}
        </section>
      )}
    </ExplainScreen>
  );
}
