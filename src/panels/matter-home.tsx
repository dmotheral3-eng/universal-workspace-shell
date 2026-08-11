import { useEffect, useMemo, useState } from "react";
import { bus } from "@/bus";
import {
  getDataProvider,
  type Document,
  type Entity,
  type Item,
  type Metric,
  type Stage,
} from "@/data";
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
  EdButton,
  EdEmpty,
  EdPill,
  EdScreen,
  Eyebrow,
  edTone,
  humanize,
  type EdTone,
} from "./editorial-kit";
import { statusTone } from "./explain";

/**
 * MATTER HOME — the "where am I / what do I do next" screen.
 *
 * Reading order is fixed by ruling (Dave, 2026-08-10) and is the whole point of
 * the screen:
 *
 *   1. the explainer + orientation strip  (what this is, where you are, next)
 *   2. the card grid                      (plain-English sections, counts, pills)
 *   3. the dense panel                    (the numbers, last)
 *
 * D-LDUX-5 re-set it in the editorial face — mono uppercase labels, Fraunces
 * answers, cause number in mono beside the matter name, parties as pills, and a
 * card grid with room to breathe instead of the cramped 240px auto-fill. The
 * order above did not move, and must not.
 */

interface CardSpec {
  panel: PanelType;
  title: string;
  description: string;
  icon: typeof FileText;
  tone: EdTone;
  action: string;
  count?: number | string;
  countLabel?: string;
  pills?: React.ReactNode;
  emphasis?: boolean;
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

/**
 * The cause number, read off the entity subtitle the provider already builds
 * (`case_number · court`). No new field and no schema change: if the first
 * segment does not look like a docket number the whole subtitle is shown as
 * mono meta instead, which is the honest fallback.
 */
function causeNumber(entity: Entity | null): string | null {
  if (!entity?.subtitle) return null;
  const head = entity.subtitle.split(" · ")[0]?.trim();
  if (!head) return null;
  return /\d/.test(head) ? head : entity.subtitle;
}

function courtLine(entity: Entity | null): string | null {
  if (!entity?.subtitle) return null;
  const parts = entity.subtitle.split(" · ");
  return parts.length > 1 ? parts.slice(1).join(" · ") : null;
}

export function MatterHomePanel() {
  const vocab = getVocabulary();
  const registered = getConfig().panels ?? [];
  const { tab } = usePanelScope();
  const { openPanel, isPanelVisible } = useLayout();

  const [entityId, setEntityId] = useState<string | null>(null);
  const [entityName, setEntityName] = useState<string | null>(null);
  const [entity, setEntity] = useState<Entity | null>(null);
  const [stages, setStages] = useState<Stage[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [docs, setDocs] = useState<Document[]>([]);
  const [metrics, setMetrics] = useState<Metric[]>([]);

  const scopeId = tab.scopeId ?? null;

  useEffect(() => {
    setEntityId(null);
    setEntityName(null);
    setEntity(null);
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
    // The header wants the cause number and the parties. Both are already on the
    // entity the list panel renders — this reads the same call, it does not add
    // a field to anything.
    provider
      .listEntities()
      .then((all) => !cancelled && setEntity(all.find((e) => e.id === entityId) ?? null))
      .catch(() => {});
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
      <EdScreen
        header={{
          eyebrow: vocab.entity,
          title: `${vocab.entity} home`,
          what: `One page per ${one}: where it stands, what is in it, and what to do next. Everything else in the workspace is a detail of this page.`,
          where: `No ${one} is open yet.`,
          next: listOpen
            ? `Pick a ${one} from the ${vocab.entityPlural} list and this page fills in.`
            : `The ${vocab.entityPlural} list is closed. Open it and pick a ${one}.`,
          action: listOpen ? undefined : (
            <EdButton
              label={`Open ${vocab.entityPlural}`}
              icon={List}
              onClick={() => openPanel("EntityList")}
            />
          ),
        }}
      >
        <EdEmpty line={`Nothing to show until a ${one} is chosen.`} />
      </EdScreen>
    );
  }

  const unread = docCounts.warn;
  const cause = causeNumber(entity);
  const court = courtLine(entity);

  // Cards are offered only for panels this profile actually registers, so the
  // healthcare demo does not advertise subpoenas.
  const allCards: CardSpec[] = [
    {
      panel: "ChatRail",
      title: "Ask about this " + one,
      description:
        "Ask a plain question and get an answer with the record it came from. This is the fastest way into anything below.",
      icon: MessageSquare,
      tone: "ok",
      action: "Ask a question",
      emphasis: true,
    },
    {
      panel: "DocBrowser",
      title: "Evidence",
      description: "Every document, and whether anyone has actually looked at it yet.",
      icon: FileText,
      tone: docCounts.risk > 0 ? "attn" : unread > 0 ? "gold" : "ok",
      action: "Open the evidence",
      count: docs.length,
      countLabel: docs.length === 1 ? "document" : "documents",
      pills: (
        <>
          {docCounts.good > 0 && <EdPill label={`Reviewed ${docCounts.good}`} tone="ok" />}
          {unread > 0 && <EdPill label={`Pending ${unread}`} tone="gold" />}
          {docCounts.risk > 0 && <EdPill label={`Flagged ${docCounts.risk}`} tone="attn" />}
        </>
      ),
    },
    {
      panel: "ItemTable",
      title: vocab.itemPlural,
      description:
        "What happened and when, in order — with the source behind each fact and the stretches where the record goes quiet.",
      icon: Clock,
      tone: "neutral",
      action: `Open the ${vocab.itemPlural.toLowerCase()}`,
      count: items.length,
      countLabel: items.length === 1 ? "fact" : "facts",
    },
    {
      panel: "StageTracker",
      title: "Where things stand",
      description: "The stages this matter moves through, and which one it is sitting in.",
      icon: ListChecks,
      tone: stages.some((s) => s.state === "blocked") ? "attn" : "neutral",
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
      tone: "ok",
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
      tone: "gold",
      action: "Open the coverage screen",
    },
  ];

  const cards = allCards.filter((c) => registered.length === 0 || registered.includes(c.panel));

  return (
    <EdScreen
      header={{
        eyebrow: vocab.entity,
        title: entityName,
        meta: cause ?? undefined,
        pills: (
          <>
            {entity?.status && (
              <EdPill label={humanize(entity.status)} tone={edTone(entity.status)} />
            )}
            {entity?.tags.map((t) => (
              <EdPill key={t} label={t} tone="neutral" title="Party or attorney on this matter" />
            ))}
            {court && <span className="ed-mono text-[11px] text-ed-muted">{court}</span>}
          </>
        ),
        what: `Everything about this ${one} in one place. Each card below opens the detail behind it; nothing here needs you to know where it is stored.`,
        where: whereLine(stages),
        next: nextLine(stages, docs, unread),
        extra: <StageStrip stages={stages} />,
        action: (
          <>
            <EdButton
              label={`Ask about this ${one}`}
              icon={MessageSquare}
              onClick={go("ChatRail")}
            />
            {(docCounts.risk > 0 || unread > 0) && (
              <EdButton
                variant="quiet"
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
      <div className="grid gap-4 px-6 py-6 [grid-template-columns:repeat(auto-fill,minmax(300px,1fr))]">
        {cards.map((c) => (
          <SectionCard key={c.panel} spec={c} onOpen={go(c.panel)} />
        ))}
      </div>

      {/* 3 — the dense panel, last */}
      {metrics.length > 0 && (
        <section className="border-t border-ed-rule px-6 py-5">
          <div className="flex items-baseline justify-between gap-3">
            <Eyebrow tick>The numbers</Eyebrow>
            <span className="ed-serif text-[13px] text-ed-muted">
              Counted from the record, not estimated
            </span>
          </div>
          <div className="mt-3 grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(170px,1fr))]">
            {metrics.map((m) => (
              <div key={m.id} className="rounded-[10px] border border-ed-rule bg-ed-card px-3.5 py-3">
                <Eyebrow>{m.label}</Eyebrow>
                <div className="mt-1.5 flex items-baseline gap-2">
                  <span className="ed-mono text-[20px] leading-none text-ed-ink tabular-nums">
                    {m.value}
                  </span>
                  {m.delta && (
                    <span className="ed-mono text-[11px] text-ed-muted">{m.delta}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
          {isPanelVisible("MetricGrid") ? null : (
            <button
              type="button"
              onClick={go("MetricGrid")}
              className="ed-focus ed-serif mt-3 inline-flex items-center gap-1 text-[14px] text-ed-sage transition-colors duration-150 hover:text-ed-ink"
            >
              Open the full metrics panel <ArrowRight className="h-3.5 w-3.5" />
            </button>
          )}
        </section>
      )}
    </EdScreen>
  );
}

/** "Where am I" at a glance: a sage bar and one pill per stage. Zero stages is a
 *  sentence, not an empty rail — a matter with no recorded phases reads normally. */
function StageStrip({ stages }: { stages: Stage[] }) {
  if (stages.length === 0) {
    return (
      <p className="ed-serif text-[14px] text-ed-muted">
        No stages recorded for this matter yet.
      </p>
    );
  }
  const done = stages.filter((s) => s.state === "done").length;
  const currentIndex = stages.findIndex((s) => s.state === "current");
  const position = currentIndex >= 0 ? currentIndex + 1 : done || 1;
  const pct = Math.round((done / stages.length) * 100);

  const tone: Record<Stage["state"], EdTone> = {
    done: "ok",
    current: "gold",
    pending: "neutral",
    blocked: "attn",
  };

  return (
    <div className="max-w-[72ch]">
      <div className="flex items-baseline justify-between gap-3">
        <Eyebrow>
          Step {position} of {stages.length}
        </Eyebrow>
        <span className="ed-mono text-[11px] text-ed-muted tabular-nums">{pct}% complete</span>
      </div>
      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-ed-rule/60">
        <div
          className="h-full rounded-full bg-ed-sage transition-[width] duration-200"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {stages.map((s) => (
          <EdPill key={s.id} label={humanize(s.name)} tone={tone[s.state]} title={s.detail} />
        ))}
      </div>
    </div>
  );
}

/** A card, not a table row: a Fraunces title, one line saying what it is for, a
 *  mono count, status pills, and one obvious way in. */
function SectionCard({ spec, onOpen }: { spec: CardSpec; onOpen: () => void }) {
  const Icon = spec.icon;
  const accent =
    spec.tone === "attn"
      ? "text-ed-attn"
      : spec.tone === "gold"
        ? "text-ed-gold"
        : spec.tone === "ok"
          ? "text-ed-sage"
          : "text-ed-muted";
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`ed-focus group flex flex-col rounded-[12px] border bg-ed-card p-5 text-left transition-[box-shadow,border-color] duration-200 hover:shadow-[0_1px_2px_rgba(35,31,26,.04),0_12px_32px_rgba(35,31,26,.06)] ${
        spec.emphasis ? "border-ed-sage/60 ring-1 ring-ed-sage/25" : "border-ed-rule hover:border-ed-gold/50"
      }`}
    >
      <div className="flex items-start gap-3">
        <span className={`mt-[3px] shrink-0 ${accent}`}>
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <h3
            className="ed-serif text-[18px] leading-[1.25] text-ed-ink"
            style={{ fontWeight: 560 }}
          >
            {spec.title}
          </h3>
          <p className="ed-serif mt-1.5 text-[14px] leading-[1.6] text-ed-muted">
            {spec.description}
          </p>
        </div>
      </div>

      {(spec.count !== undefined || spec.pills) && (
        <div className="mt-3.5 flex flex-wrap items-baseline gap-x-2 gap-y-1.5">
          {spec.count !== undefined && (
            <span className="ed-mono text-[22px] leading-none text-ed-ink tabular-nums">
              {spec.count}
            </span>
          )}
          {spec.countLabel && <Eyebrow>{spec.countLabel}</Eyebrow>}
          {spec.pills}
        </div>
      )}

      <span className="ed-serif mt-4 inline-flex items-center gap-1 text-[14px] text-ed-sage">
        {spec.action} →
      </span>
    </button>
  );
}
