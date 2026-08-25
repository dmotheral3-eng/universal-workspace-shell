import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { getConfig } from "@/config";
import { getDataProvider } from "@/data";
import { LawDogProvider, type LdMasterCaseDoc } from "@/data/lawdog-provider";
import type { Entity } from "@/data/types";
import { getSession, signOut } from "@/data/lawdog-auth";
import { ExportBar, MasterCaseDocView, masterCaseDocToCsv } from "@/panels/legal/master-case-doc";
import { dateOnly, humanize, money, moneyRange } from "@/panels/legal/ld-kit";
import { LayoutRenderer, WorkspaceHeader, CollapsedRail, CommandPalette } from "@/shell";
import { NavRail } from "@/shell/nav-rail";
import { PathPanelRoute } from "@/shell/path-route";
import { Brain } from "./brain";

/**
 * SPECTRUM FACE — D-LDSPECTRUM-1 (Dave word 2026-08-25: "this is what we want to
 * be the new lawdog interface").
 *
 * Two zones. READ is fixed: each tab is arranged by the answer, not by the
 * reader — eyebrow, one-line sub, the numbers, one table, one note. BRAIN asks
 * the record-only answer door (fn_answer_legal) and shows every row it read;
 * when the door cannot ground a question it says so in a declined block, with
 * the questions it can answer. WORK is the existing panel workspace — drag,
 * dock, pop out; that arrangement is the reader's own.
 *
 * Palette from the brief: near-white ground, white cards, one blue for
 * category labels and the live state. Every count is the record's.
 */

const s = (v: unknown): string => (v === null || v === undefined ? "" : String(v));

const TABS = [
  { id: "brain", label: "Brain", eyebrow: "Ask", sub: "Ask it anything — answered only from rows we hold" },
  { id: "matter", label: "Matter", eyebrow: "Where you are", sub: "The matter in one screen" },
  { id: "claims", label: "Claims", eyebrow: "Theories", sub: "Each claim, which side it helps, and how strong the record says it is" },
  { id: "evidence", label: "Evidence", eyebrow: "Documents", sub: "Every document in the file and whether anyone has looked at it" },
  { id: "timeline", label: "Timeline", eyebrow: "Chronology", sub: "What happened and when, in order" },
  { id: "people", label: "People", eyebrow: "Parties", sub: "Who is on each side, and who speaks for them" },
  { id: "records", label: "Records", eyebrow: "Subpoenas", sub: "What we asked for, from whom, and whether it came back" },
  { id: "owed", label: "Owed", eyebrow: "Next", sub: "The next moves and what is due" },
  { id: "master", label: "Master doc", eyebrow: "Binder", sub: "The whole matter as one document — build it to Word or print it" },
] as const;
type TabId = (typeof TABS)[number]["id"];

/* ---------- small pieces ---------- */

function Stats({ items }: { items: [string, string][] }) {
  return (
    <div className="sp-stats">
      {items.map(([n, l]) => (
        <div key={l} className="sp-stat">
          <b>{n}</b>
          <span>{l}</span>
        </div>
      ))}
    </div>
  );
}

function Table({ cols, rows, widths }: { cols: string[]; rows: ReactNode[][]; widths?: string }) {
  const grid = widths ?? cols.map(() => "1fr").join(" ");
  return (
    <div className="sp-card">
      <div className="sp-thead" style={{ gridTemplateColumns: grid }}>
        {cols.map((c, i) => (
          <span key={i}>{c}</span>
        ))}
      </div>
      {rows.length === 0 ? (
        <div className="sp-empty">Nothing on the record for this yet.</div>
      ) : (
        rows.map((r, i) => (
          <div key={i} className="sp-tr" style={{ gridTemplateColumns: grid }}>
            {r.map((c, j) => (
              <span key={j} className={j === 0 ? "sp-td sp-strong" : "sp-td sp-muted"}>
                {c}
              </span>
            ))}
          </div>
        ))
      )}
    </div>
  );
}

/* ---------- Read tabs from the master row ---------- */

function sideWord(side: unknown): string {
  const v = s(side).toLowerCase();
  if (["ours", "for", "plaintiff", "client", "us"].includes(v)) return "For us";
  if (["theirs", "against", "defendant", "opposing", "them"].includes(v)) return "Against us";
  return humanize(s(side)) || "Unsided";
}

function ReadBody({ tab, doc }: { tab: Exclude<TabId, "brain" | "master">; doc: LdMasterCaseDoc }) {
  const c = doc.counts;
  switch (tab) {
    case "matter":
      return (
        <>
          <Stats items={[[moneyRange(doc.recoveryLow, doc.recoveryHigh), "Recovery range"], [money(doc.totalDocumented), "Documented"], [doc.caseStrength === null ? "—" : String(doc.caseStrength), "Strength"], [String(c.open_tasks ?? 0), "Open tasks"]]} />
          <Table cols={["Field", "On record"]} widths="1fr 3fr" rows={[
            ["Matter", doc.caseName], ["Number", s(doc.caseNumber) || "—"], ["Court", s(doc.court) || "—"], ["Judge", s(doc.judge) || "—"],
            ["Client", s(doc.clientName) || "—"], ["Opposing", s(doc.opposingParty) || "—"], ["Counsel", s(doc.attorney) || "—"],
            ["State", humanize(s(doc.caseState)) || "—"], ["Status", s(doc.status) || "—"], ["Filed", dateOnly(doc.filedDate)], ["Answer due", dateOnly(doc.answerDue)],
          ]} />
          <p className="sp-note">{doc.posture || "No posture line is on record yet. The fields above are the record's own."}</p>
        </>
      );
    case "claims": {
      const forUs = doc.claims.filter((k) => sideWord(k.side) === "For us").length;
      const against = doc.claims.filter((k) => sideWord(k.side) === "Against us").length;
      return (
        <>
          <Stats items={[[String(doc.claims.length), "Claims"], [String(forUs), "For us"], [String(against), "Against us"], [String(doc.faultGrounds.length), "Fault grounds"]]} />
          <Table cols={["Claim", "Side", "Score", "Status"]} widths="2.2fr 1fr .8fr 1fr" rows={doc.claims.map((k) => [`${s(k.code)} ${s(k.name)}`.trim(), sideWord(k.side), k.score !== null && k.score !== undefined ? `${s(k.score)}/${s(k.max_score) || "?"}` : "—", humanize(s(k.status)) || "—"])} />
          {doc.faultGrounds.length ? (
            <>
              <div className="sp-secLabel" style={{ marginTop: 20 }}>Fault grounds <em>{doc.faultGrounds.length}</em></div>
              <Table cols={["Statute", "Ground", "Strength"]} widths="1fr 2.4fr 1fr" rows={doc.faultGrounds.map((g) => [s(g.statute), s(g.ground), humanize(s(g.strength)) || "—"])} />
            </>
          ) : null}
          <p className="sp-note">A claim scored against us is shown in the same table as one for us. Weakness is a fact of the record, not a thing to hide.</p>
        </>
      );
    }
    case "evidence": {
      const reviewed = doc.documents.filter((d) => /review|settled|verified/i.test(s(d.status))).length;
      const flagged = doc.documents.filter((d) => /flag|dispute|withheld/i.test(s(d.status))).length;
      return (
        <>
          <Stats items={[[String(doc.documents.length), "Documents"], [String(reviewed), "Reviewed"], [String(flagged), "Flagged"], [String(doc.exhibits.length), "Exhibits"]]} />
          <Table cols={["Document", "Category", "Status", "Added"]} widths="2.4fr 1fr 1fr .9fr" rows={doc.documents.map((d) => [s(d.filename), humanize(s(d.category)) || "—", humanize(s(d.status)) || "—", dateOnly(s(d.created_at))])} />
          <p className="sp-note">{doc.documents.length} document{doc.documents.length === 1 ? "" : "s"} on the record. A document listed here has a row; whether its text is held for Ask is a separate fact, shown in the Master doc.</p>
        </>
      );
    }
    case "timeline":
      return (
        <>
          <Stats items={[[String(doc.timeline.length), "Entries"], [dateOnly(s(doc.timeline[0]?.date)), "First"], [dateOnly(s(doc.timeline[doc.timeline.length - 1]?.date)), "Latest"]]} />
          <Table cols={["Date", "Actor", "What happened"]} widths=".9fr 1fr 3fr" rows={doc.timeline.map((t) => [dateOnly(s(t.date)), s(t.actor) || "—", [s(t.type), s(t.description)].filter(Boolean).join(": ")])} />
          <p className="sp-note">Every line carries a provenance reference on the record. Open the Master doc or the Work zone to read one in full.</p>
        </>
      );
    case "people":
      return (
        <>
          <Stats items={[[String(doc.parties.length), "People"], [String(doc.parties.filter((p) => p.is_client).length), "Clients"], [String(doc.parties.filter((p) => s(p.counsel_name)).length), "With counsel"]]} />
          <Table cols={["Role", "Name", "Counsel"]} widths="1fr 2fr 1.6fr" rows={doc.parties.length ? doc.parties.map((p) => [humanize(s(p.role)), s(p.name), s(p.counsel_name) || "—"]) : [["Client", s(doc.clientName) || "—", s(doc.attorney) || "—"], ["Opposing", s(doc.opposingParty) || "—", "—"]]} />
          <p className="sp-note">A name appears here only from a party row. Nobody is guessed in.</p>
        </>
      );
    case "records":
      return (
        <>
          <Stats items={[[String(doc.subpoenas.length), "Asked for"], [String(doc.subpoenas.filter((x) => /return|receiv|complete|closed/i.test(s(x.status))).length), "Came back"], [String(doc.exhibits.filter((x) => x.needs_subpoena).length), "Exhibits waiting on one"]]} />
          <Table cols={["#", "Target", "What it proves", "Status"]} widths=".4fr 1.6fr 2.4fr 1fr" rows={doc.subpoenas.map((x) => [s(x.no) || "—", s(x.target), s(x.what_it_proves) || s(x.what_it_gets) || "—", humanize(s(x.status)) || "—"])} />
          <p className="sp-note">A record we asked for is not a record we hold until it comes back and is logged.</p>
        </>
      );
    case "owed":
      return (
        <>
          <Stats items={[[String(doc.nextMoves.length), "Next moves"], [String(doc.openTasks.length), "Open tasks"], [dateOnly(s(doc.openTasks.find((t) => s(t.due))?.due)), "Nearest due"]]} />
          <Table cols={["Move", "Remedy", "Status"]} widths="2fr 2fr .9fr" rows={doc.nextMoves.map((m) => [s(m.what_we_found), s(m.remedy) || "—", humanize(s(m.status)) || "—"])} />
          {doc.openTasks.length ? (
            <>
              <div className="sp-secLabel" style={{ marginTop: 20 }}>Open tasks <em>{doc.openTasks.length}</em></div>
              <Table cols={["Due", "Task", "Priority"]} widths=".8fr 3fr .8fr" rows={doc.openTasks.slice(0, 25).map((t) => [dateOnly(s(t.due)), s(t.name), humanize(s(t.priority)) || "—"])} />
            </>
          ) : null}
          <p className="sp-note">The software owns the chase. Nothing here moves until an outcome is logged.</p>
        </>
      );
  }
}

/* ---------- the face ---------- */

export function SpectrumApp() {
  const cfg = getConfig();
  const provider = getDataProvider();
  const ld = provider instanceof LawDogProvider ? provider : null;
  const session = getSession();

  const [zone, setZone] = useState<"read" | "work">("read");
  const [tab, setTab] = useState<TabId>("brain");
  const [entities, setEntities] = useState<Entity[]>([]);
  const [entityId, setEntityId] = useState<string | null>(cfg.data.lawdog?.caseId ?? null);
  const [doc, setDoc] = useState<LdMasterCaseDoc | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [errText, setErrText] = useState<string | null>(null);
  const [sync, setSync] = useState<string | null>(null);
  const reload = useRef(0);

  useEffect(() => {
    if (!ld) return;
    void ld.listEntities().then((es) => {
      setEntities(es);
      setEntityId((cur) => cur ?? es[0]?.id ?? null);
    }).catch(() => undefined);
  }, [ld]);

  const load = useCallback(async () => {
    if (!ld || !entityId) return;
    const t0 = performance.now();
    setState("loading");
    try {
      const d = await ld.getMasterCaseDoc(entityId);
      setDoc(d);
      setState("ready");
      setSync(`Updated · ${Math.round(performance.now() - t0)}ms`);
      setTimeout(() => setSync(null), 2600);
    } catch (e) {
      setErrText(e instanceof Error ? e.message : String(e));
      setState("error");
    }
  }, [ld, entityId]);

  useEffect(() => {
    void load();
  }, [load, reload.current]);

  const meta = useMemo(() => TABS.find((t) => t.id === tab)!, [tab]);
  const questions = cfg.chat?.suggestedQuestions ?? [];

  return (
    <div className="sp">
      <style>{CSS}</style>
      <header className="sp-top">
        <div className="sp-brand">
          <span className="sp-mark" />
          <span className="sp-bname">{cfg.brand.name}</span>
          <select className="sp-pick" value={entityId ?? ""} onChange={(e) => setEntityId(e.target.value || null)} aria-label="Matter">
            {entities.length === 0 ? <option value="">No matters on record</option> : null}
            {entities.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
          <span className="sp-who">{session?.email ?? ""}</span>
        </div>
        <div className="sp-controls">
          {sync && <span className="sp-synced">{sync}</span>}
          <div className="sp-seg">
            <button className={zone === "read" ? "sp-sg on" : "sp-sg"} onClick={() => setZone("read")}>Read</button>
            <button className={zone === "work" ? "sp-sg on" : "sp-sg"} onClick={() => setZone("work")}>Work</button>
          </div>
          <button className="sp-update" onClick={() => { reload.current += 1; void load(); }}>Update</button>
          <button className="sp-ghost" onClick={() => void signOut()}>Sign out</button>
        </div>
      </header>

      {zone === "read" ? (
        <>
          <nav className="sp-tabs">
            {TABS.map((t) => (
              <button key={t.id} className={tab === t.id ? "sp-tb on" : "sp-tb"} onClick={() => setTab(t.id)}>{t.label}</button>
            ))}
          </nav>
          <main className={tab === "brain" ? "sp-page sp-wide" : "sp-page"}>
            <div className="sp-eyebrow">{meta.eyebrow}</div>
            <h2 className="sp-h2">{meta.sub}</h2>

            {!ld ? <div className="sp-refused"><p>This door is not on the legal store, so the Read zone has no record to draw from.</p></div> : null}
            {ld && state === "loading" && !doc ? <p className="sp-fixedNote">Reading the record…</p> : null}
            {state === "error" ? <div className="sp-refused"><p>{errText}</p></div> : null}
            {doc && ld ? (
              tab === "brain" ? <Brain doc={doc} provider={ld} questions={questions} entities={entities} onOpenMatter={setEntityId} />
              : tab === "master" ? <div className="sp-card sp-master"><ExportBar d={doc} /><MasterCaseDocView d={doc} /></div>
              : <ReadBody tab={tab} doc={doc} />
            ) : null}
            {doc && tab !== "master" ? (
              <div className="sp-exports">
                <button className="sp-ghost" onClick={() => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([masterCaseDocToCsv(doc)], { type: "text/csv" })); a.download = `${doc.slug || "matter"}_record.csv`; a.click(); }}>Export the record</button>
                <span className="sp-exNote">Every count on this page is the record's. Nothing is estimated.</span>
              </div>
            ) : null}
            <p className="sp-fixedNote">This view is fixed. What you read is arranged by the answer, not by you.</p>
          </main>
        </>
      ) : (
        <div className="sp-work">
          <PathPanelRoute />
          <div className="flex h-full w-full flex-col overflow-hidden bg-background">
            <WorkspaceHeader />
            <div className="flex flex-1 overflow-hidden">
              <NavRail />
              <CollapsedRail />
              <LayoutRenderer />
            </div>
            <CommandPalette />
          </div>
        </div>
      )}
    </div>
  );
}

const CSS = `
.sp{--bg:#F4F6F8;--card:#FFFFFF;--panel:#EDF0F4;--ink:#131820;--body:#59636F;--mute:#8A939E;--line:#E4E8ED;
 --blue:#2563EB;--blueSoft:#EFF4FF;--green:#0E9F6E;--amber:#B45309;--rose:#DC2626;
 background:var(--bg);min-height:100vh;height:100vh;display:flex;flex-direction:column;color:var(--body);
 font-family:Inter,-apple-system,"Segoe UI",system-ui,sans-serif;font-size:14px;line-height:1.6;-webkit-font-smoothing:antialiased;}
.sp *{box-sizing:border-box;}
.sp-top{display:flex;justify-content:space-between;align-items:center;gap:20px;flex-wrap:wrap;padding:12px 28px;background:var(--card);border-bottom:1px solid var(--line);}
.sp-brand{display:flex;align-items:center;gap:12px;flex-wrap:wrap;}
.sp-mark{width:22px;height:22px;border-radius:6px;background:var(--blue);box-shadow:inset 0 0 0 4px #fff,0 0 0 1px var(--blue);}
.sp-bname{font-size:16px;font-weight:650;color:var(--ink);letter-spacing:-.01em;}
.sp-pick{font:inherit;font-size:13px;color:var(--ink);background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:6px 10px;max-width:360px;}
.sp-who{font-size:12.5px;color:var(--mute);}
.sp-controls{display:flex;align-items:center;gap:12px;}
.sp-synced{font-size:12px;color:var(--green);}
.sp-seg{display:flex;background:var(--panel);border-radius:8px;padding:3px;}
.sp-sg{background:none;border:0;padding:6px 15px;border-radius:6px;font:inherit;font-size:12.5px;color:var(--body);cursor:pointer;}
.sp-sg.on{background:var(--card);color:var(--ink);font-weight:600;box-shadow:0 1px 2px rgba(19,24,32,.08);}
.sp-update{background:var(--blue);border:0;color:#fff;font:inherit;font-size:12.5px;font-weight:600;padding:8px 16px;border-radius:8px;cursor:pointer;}
.sp-update:hover{filter:brightness(1.07);} .sp-update:disabled{opacity:.6;cursor:default;}
.sp-tabs{display:flex;gap:2px;overflow-x:auto;padding:0 28px;background:var(--card);border-bottom:1px solid var(--line);}
.sp-tb{background:none;border:0;border-bottom:2px solid transparent;padding:11px 14px;font:inherit;font-size:13.5px;color:var(--mute);cursor:pointer;white-space:nowrap;margin-bottom:-1px;}
.sp-tb:hover{color:var(--body);} .sp-tb.on{color:var(--blue);border-bottom-color:var(--blue);font-weight:600;}
.sp-page{max-width:1040px;padding:34px 28px 64px;overflow:auto;flex:1;}
.sp-eyebrow{font-size:12.5px;color:var(--blue);font-weight:600;margin-bottom:7px;}
.sp-h2{font-size:26px;line-height:1.25;color:var(--ink);font-weight:650;letter-spacing:-.02em;margin:0 0 26px;max-width:38ch;}
.sp-memory{background:var(--blueSoft);border:1px solid #C7D7FE;border-radius:12px;padding:16px 18px;margin-bottom:22px;}
.sp-memHead{font-size:12.5px;font-weight:600;color:#1D4ED8;margin-bottom:9px;}
.sp-memNums{display:flex;gap:24px;flex-wrap:wrap;margin-bottom:9px;} .sp-memNums span{font-size:12.5px;color:#1E3A8A;}
.sp-memNums b{font-size:19px;color:#1D4ED8;font-weight:650;margin-right:5px;}
.sp-memory p{margin:0;font-size:13px;color:#1E3A8A;max-width:70ch;}
.sp-qbar{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:10px 12px 10px 18px;font-size:15px;color:var(--ink);display:flex;gap:12px;align-items:center;box-shadow:0 1px 3px rgba(19,24,32,.05);margin-bottom:12px;}
.sp-qc{font-size:11.5px;font-weight:650;color:var(--blue);background:var(--blueSoft);padding:3px 9px;border-radius:5px;flex-shrink:0;}
.sp-qin{flex:1;border:0;outline:0;font:inherit;font-size:15px;color:var(--ink);background:transparent;}
.sp-suggest{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:24px;}
.sp-answer{display:flex;flex-direction:column;gap:13px;margin-bottom:30px;}
.sp-answer p{margin:0;font-size:14.5px;color:var(--body);line-height:1.65;display:flex;gap:11px;align-items:baseline;flex-wrap:wrap;}
.sp-src{font-size:10.5px;font-weight:650;padding:3px 8px;border-radius:5px;flex-shrink:0;}
.sp-src.measured{background:#ECFDF5;color:#047857;} .sp-src.onrecord{background:var(--blueSoft);color:#1D4ED8;}
.sp-src.ourread{background:#FEF3C7;color:#92400E;} .sp-src.estimate{background:#FEE2E2;color:#B91C1C;}
.sp-secLabel{font-size:12.5px;font-weight:600;color:var(--ink);margin-bottom:9px;} .sp-secLabel em{font-style:normal;font-weight:400;color:var(--mute);}
.sp-card{background:var(--card);border:1px solid var(--line);border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(19,24,32,.05);}
.sp-thead,.sp-tr{display:grid;gap:14px;padding:11px 16px;}
.sp-thead{background:#F8FAFB;border-bottom:1px solid var(--line);font-size:11.5px;font-weight:600;color:var(--mute);}
.sp-tr{border-bottom:1px solid #F1F4F7;font-size:13.5px;} .sp-tr:last-child{border-bottom:0;}
.sp-td{min-width:0;overflow-wrap:anywhere;} .sp-strong{color:var(--ink);font-weight:550;} .sp-muted{color:var(--body);}
.sp-empty{padding:18px 16px;font-size:13px;color:var(--mute);}
@media(max-width:720px){.sp-thead{display:none}.sp-tr{grid-template-columns:1fr!important;gap:3px}}
.sp-stats{display:flex;gap:36px;flex-wrap:wrap;margin-bottom:20px;}
.sp-stat{display:flex;flex-direction:column;} .sp-stat b{font-size:27px;color:var(--ink);font-weight:650;line-height:1.15;letter-spacing:-.02em;}
.sp-stat span{font-size:12.5px;color:var(--mute);margin-top:2px;}
.sp-note{border-left:3px solid var(--blue);padding-left:14px;margin:20px 0 0;font-size:13.5px;color:var(--body);max-width:74ch;}
.sp-wide{max-width:none;padding:0;display:flex;flex-direction:column;}
.sp-wide .sp-eyebrow,.sp-wide .sp-h2{padding-left:28px;padding-right:28px;}
.sp-wide .sp-eyebrow{padding-top:20px;}
.sp-wide .sp-fixedNote,.sp-wide .sp-exports{padding-left:28px;padding-right:28px;}
.sp-fixedNote{margin-top:30px;font-size:12.5px;color:var(--mute);}
.sp-refused{background:#FEF2F2;border:1px solid #FECACA;border-radius:12px;padding:16px 18px;margin-top:6px;margin-bottom:22px;}
.sp-refTop{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;margin-bottom:9px;}
.sp-refQ{font-size:14.5px;color:#7F1D1D;} .sp-refTag{font-size:11px;font-weight:650;color:var(--rose);background:#FEE2E2;padding:3px 9px;border-radius:5px;flex-shrink:0;}
.sp-refused p{margin:0 0 8px;font-size:13.5px;color:#991B1B;max-width:72ch;} .sp-refDo{color:#1D4ED8!important;font-weight:550;}
.sp-exports{display:flex;gap:9px;align-items:center;flex-wrap:wrap;margin-top:26px;}
.sp-ghost{background:var(--card);border:1px solid var(--line);border-radius:8px;font:inherit;font-size:12.5px;color:var(--body);padding:8px 15px;cursor:pointer;}
.sp-ghost:hover{border-color:#C9D2DC;color:var(--ink);} .sp-ghost:disabled{opacity:.5;cursor:default;}
.sp-exNote{font-size:12px;color:var(--mute);margin-left:5px;}
.sp-link{background:none;border:0;padding:0;font:inherit;color:var(--blue);cursor:pointer;text-decoration:underline;}
.sp-master{padding:0 0 8px;}
.sp-work{flex:1;min-height:0;display:flex;}
.sp button:focus-visible{outline:2px solid var(--blue);outline-offset:2px;}
@media print{.sp-top,.sp-tabs,.sp-exports,.sp-suggest,.sp-qbar{display:none}.sp-page{padding:0}}
@media(prefers-reduced-motion:reduce){.sp *{transition:none!important}}
`;
