import { useCallback, useEffect, useState } from "react";
import type { LawDogProvider, LdAnswer, LdMasterCaseDoc } from "@/data/lawdog-provider";
import type { Entity } from "@/data/types";
import { dateOnly, humanize } from "@/panels/legal/ld-kit";

/**
 * THE BRAIN — D-LDBRAIN-1 (Dave word 2026-08-25: the reference "will be the ai
 * interface within it in another tab").
 *
 * Four ideas, not one:
 *   1 THREADS      a question is a saved thing you come back to
 *                  (legal.ld_ask_threads / ld_ask_turns, tenant RLS)
 *   2 CITED PROSE  every claim carries a chip; the chip opens the record beside
 *                  the answer with the exact line highlighted
 *   3 THE GRID     matters as rows, a column you WRITE as a question, run across
 *                  the whole book, every cell carrying where it came from
 *   4 SAVED        a question you liked, kept with the cadence you want
 *
 * THE GRID IS THE PRODUCT. A thread answers one question about one matter. The
 * grid asks one question of every matter at once — which is what a book of
 * matters actually needs and what a chat box structurally cannot give.
 *
 * HONESTY RULE HELD HERE: nothing runs a saved question yet. There is no
 * scheduler on this estate, so the modal says so instead of implying a delivery
 * that will not arrive.
 */

type Row = Record<string, unknown>;
const s = (v: unknown): string => (v === null || v === undefined ? "" : String(v));

interface Thread { thread_id: string; title: string; updated_at: string; case_id: string | null }
interface Turn { turn_id: string; question: string; answer: LdAnswer | null; understood: boolean | null; asked_at: string }
interface SavedQ { saved_id: string; name: string; question: string; cadence: string | null; day_of_week: string | null; time_of_day: string | null; is_active: boolean }

/* A claim carries the rows it was drawn from; the chip opens them. */
interface Claim { src: "On record" | "Measured" | "Our read"; text: string; cite: string | null }

function claimsFrom(a: LdAnswer, rowCount: number): Claim[] {
  const out: Claim[] = [];
  if (a.answer?.headline) out.push({ src: "On record", text: s(a.answer.headline), cite: rowCount ? `${rowCount} row${rowCount === 1 ? "" : "s"} read` : null });
  if (a.intent) out.push({ src: "Measured", text: `Read as a question about ${humanize(a.intent)}, answered by ${s(a.engine) || "the record"} — no model wrote this line.`, cite: null });
  for (const n of a.next ?? []) if (n.label) out.push({ src: "Our read", text: s(n.label), cite: null });
  return out;
}

export function Brain({
  doc,
  provider,
  questions,
  entities,
  onOpenMatter,
}: {
  doc: LdMasterCaseDoc;
  provider: LawDogProvider;
  questions: string[];
  entities: Entity[];
  onOpenMatter: (id: string) => void;
}) {
  const [view, setView] = useState<"thread" | "grid">("thread");
  const [threads, setThreads] = useState<Thread[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [saved, setSaved] = useState<SavedQ[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [openRows, setOpenRows] = useState<{ title: string; rows: Row[]; hl: number } | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);

  const tenant = doc.tenantId;

  const refresh = useCallback(async () => {
    if (!tenant) return;
    try {
      setThreads(await provider.listAskThreads(doc.caseId));
      setSaved(await provider.listSavedQuestions(doc.caseId));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, [provider, doc.caseId, tenant]);

  useEffect(() => {
    setThreadId(null);
    setTurns([]);
    setOpenRows(null);
    void refresh();
  }, [refresh]);

  const openThread = useCallback(
    async (id: string) => {
      setThreadId(id);
      setOpenRows(null);
      try {
        setTurns(await provider.listAskTurns(id));
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      }
    },
    [provider]
  );

  const ask = useCallback(
    async (text: string) => {
      const t = text.trim();
      if (!t) return;
      if (!tenant) { setErr("This matter has no tenant on record, so the answer door cannot be opened for it."); return; }
      setBusy(true); setErr(null);
      try {
        const a = await provider.askLegal(tenant, t);
        let id = threadId;
        if (!id) {
          id = await provider.createAskThread(tenant, doc.caseId, t.slice(0, 120));
          setThreadId(id);
          setThreads(await provider.listAskThreads(doc.caseId));
        }
        await provider.appendAskTurn(id, tenant, t, a);
        setTurns(await provider.listAskTurns(id));
        setQ("");
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [provider, tenant, threadId, doc.caseId]
  );

  const last = turns[turns.length - 1] ?? null;

  return (
    <div className="br">
      <style>{CSS}</style>

      {/* 1 — THREADS */}
      <aside className="br-rail">
        <button className="br-newT" onClick={() => { setThreadId(null); setTurns([]); setOpenRows(null); }}>＋ New question</button>
        <div className="br-railLab">Threads</div>
        {threads.length === 0 ? <p className="br-railEmpty">Nothing asked about this matter yet.</p> : null}
        {threads.map((t) => (
          <button key={t.thread_id} className={t.thread_id === threadId ? "br-th on" : "br-th"} onClick={() => void openThread(t.thread_id)}>
            <span className="br-thT">{t.title}</span>
            <span className="br-thM">{dateOnly(t.updated_at)}</span>
          </button>
        ))}
        {saved.length ? (
          <>
            <div className="br-railLab" style={{ marginTop: 14 }}>Saved questions</div>
            {saved.map((sq) => (
              <button key={sq.saved_id} className="br-th" onClick={() => { setThreadId(null); setTurns([]); void ask(sq.question); }}>
                <span className="br-thT">{sq.name}</span>
                <span className="br-thM">
                  <i className="br-savedDot" />
                  {[sq.cadence, sq.day_of_week, sq.time_of_day].filter(Boolean).join(" · ") || "No cadence"} · not running
                </span>
              </button>
            ))}
          </>
        ) : null}
      </aside>

      <main className="br-mid">
        <div className="br-midTop">
          <div className="br-seg">
            <button className={view === "thread" ? "br-sg on" : "br-sg"} onClick={() => setView("thread")}>Thread</button>
            <button className={view === "grid" ? "br-sg on" : "br-sg"} onClick={() => setView("grid")}>Grid</button>
          </div>
          <span className="br-scope">{entities.length} matter{entities.length === 1 ? "" : "s"} · this book</span>
        </div>

        {err ? <div className="br-err">{err}</div> : null}

        {view === "thread" ? (
          <div className="br-scroll">
            <div className="br-memBar">
              What it holds for {doc.caseName}: {doc.counts.documents ?? 0} documents, {doc.counts.timeline ?? 0} timeline rows,
              {" "}{doc.counts.claims ?? 0} claims, {doc.counts.parties ?? 0} people. It answers from these rows only.
            </div>

            {turns.map((t) => {
              const a = t.answer;
              const rows: Row[] = Array.isArray(a?.answer?.rows) ? (a!.answer!.rows as Row[]) : [];
              return (
                <div key={t.turn_id} className="br-turn">
                  <div className="br-q">{t.question}</div>
                  {a && a.understood ? (
                    <div className="br-ans">
                      {claimsFrom(a, rows.length).map((c, i) => (
                        <p key={i}>
                          <span className={"br-src " + c.src.toLowerCase().replace(" ", "")}>{c.src}</span>
                          {c.text}
                          {c.cite ? (
                            <button className="br-cite" onClick={() => setOpenRows({ title: t.question, rows, hl: 0 })}>{c.cite} ›</button>
                          ) : null}
                        </p>
                      ))}
                      {(a.next ?? []).filter((n) => n.question).map((n, i) => (
                        <button key={`n${i}`} className="br-rel" onClick={() => void ask(n.question!)}>{n.question}</button>
                      ))}
                    </div>
                  ) : (
                    <div className="br-refused">
                      <div className="br-refTop"><span className="br-refQ">“{t.question}”</span><span className="br-refTag">Declined</span></div>
                      <p>{s(a?.reason) || "The record could not ground that question, so nothing was said."}</p>
                      {(a?.try ?? []).map((x, i) => (
                        <button key={i} className="br-rel" onClick={() => void ask(x)}>{x}</button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {turns.length === 0 ? (
              <>
                <div className="br-relLab">Start with</div>
                {questions.map((sq) => (
                  <button key={sq} className="br-rel" onClick={() => void ask(sq)}>{sq}</button>
                ))}
              </>
            ) : null}

            <div className="br-askBox">
              <input
                className="br-askIn"
                value={q}
                placeholder={turns.length ? "Ask a follow-up…" : "Ask about this matter…"}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void ask(q); }}
              />
              <div className="br-askChips">
                <span className="br-ch">{doc.caseName}</span>
                <span className="br-ch">Record only</span>
                <button className="br-chR" disabled={busy} onClick={() => void ask(q)}>{busy ? "Reading…" : "Ask ↑"}</button>
              </div>
            </div>

            {last ? (
              <div className="br-actions">
                <button className="br-gh" onClick={() => void navigator.clipboard?.writeText(`${last.question}\n${s(last.answer?.answer?.headline ?? last.answer?.reason)}`)}>Copy</button>
                <button className="br-pr" onClick={() => setSaveOpen(true)}>✦ Save this question</button>
              </div>
            ) : null}
          </div>
        ) : (
          <GridView provider={provider} entities={entities} onOpenMatter={onOpenMatter} />
        )}
      </main>

      {/* 2 — the record, beside the answer */}
      {openRows ? (
        <aside className="br-doc">
          <div className="br-docTop">
            <div>
              <div className="br-docT">What it read</div>
              <div className="br-docM">{openRows.rows.length} row{openRows.rows.length === 1 ? "" : "s"} · {openRows.title}</div>
            </div>
            <button className="br-x" onClick={() => setOpenRows(null)}>✕</button>
          </div>
          <div className="br-docBody">
            {openRows.rows.map((r, i) => (
              <div key={i} className={i === openRows.hl ? "br-rec hl" : "br-rec"} onClick={() => setOpenRows({ ...openRows, hl: i })}>
                {Object.entries(r).filter(([, v]) => v !== null && v !== "").slice(0, 8).map(([k, v]) => (
                  <div key={k} className="br-dl"><span className="br-dk">{humanize(k)}</span><span className="br-dv">{s(v)}</span></div>
                ))}
              </div>
            ))}
            {openRows.rows.length === 0 ? <p className="br-railEmpty">The door answered with a headline and no rows.</p> : null}
          </div>
          <div className="br-docFoot">The highlighted record is the one the answer used.</div>
        </aside>
      ) : null}

      {/* 4 — saved, and honest about it */}
      {saveOpen && last ? (
        <SaveModal
          provider={provider}
          tenant={tenant}
          caseId={doc.caseId}
          question={last.question}
          onClose={() => setSaveOpen(false)}
          onSaved={() => { setSaveOpen(false); void refresh(); }}
        />
      ) : null}
    </div>
  );
}

/* ---------- 3 — THE GRID ---------- */

function GridView({ provider, entities, onOpenMatter }: { provider: LawDogProvider; entities: Entity[]; onOpenMatter: (id: string) => void }) {
  const [cols, setCols] = useState<{ name: string; question: string }[]>([]);
  const [cells, setCells] = useState<Record<string, { text: string; understood: boolean; rows: number }>>({});
  const [making, setMaking] = useState(false);
  const [name, setName] = useState("");
  const [question, setQuestion] = useState("");
  const [running, setRunning] = useState(false);
  const [docs, setDocs] = useState<Record<string, LdMasterCaseDoc | null>>({});

  useEffect(() => {
    let dead = false;
    void (async () => {
      const out: Record<string, LdMasterCaseDoc | null> = {};
      for (const e of entities.slice(0, 40)) {
        try { out[e.id] = await provider.getMasterCaseDoc(e.id); } catch { out[e.id] = null; }
      }
      if (!dead) setDocs(out);
    })();
    return () => { dead = true; };
  }, [entities, provider]);

  const run = useCallback(async () => {
    const nm = name.trim() || question.trim().slice(0, 40);
    if (!question.trim()) return;
    setRunning(true);
    const col = { name: nm, question: question.trim() };
    const next = { ...cells };
    for (const e of entities.slice(0, 40)) {
      const d = docs[e.id];
      const key = `${e.id}|${col.name}`;
      if (!d?.tenantId) { next[key] = { text: "No tenant on record", understood: false, rows: 0 }; continue; }
      try {
        const a = await provider.askLegal(d.tenantId, col.question);
        const rows = Array.isArray(a.answer?.rows) ? a.answer!.rows!.length : 0;
        next[key] = a.understood
          ? { text: s(a.answer?.headline) || `${rows} row${rows === 1 ? "" : "s"}`, understood: true, rows }
          : { text: "Declined — not grounded in this matter", understood: false, rows: 0 };
      } catch (err) {
        next[key] = { text: err instanceof Error ? err.message.slice(0, 60) : "Failed", understood: false, rows: 0 };
      }
    }
    setCells(next);
    setCols((c) => (c.some((x) => x.name === col.name) ? c : [...c, col]));
    setRunning(false);
    setMaking(false);
    setName(""); setQuestion("");
  }, [name, question, entities, docs, provider, cells]);

  const grid = `1.4fr repeat(${Math.max(cols.length, 1)}, 1.4fr)`;

  return (
    <div className="br-scroll">
      <div className="br-gridHead">
        <div>
          <div className="br-gTitle">Every matter in the book</div>
          <div className="br-gSub">One question, asked of all of them. Each cell says whether the record could answer it.</div>
        </div>
        <button className="br-pr" onClick={() => setMaking(!making)}>＋ Add column</button>
      </div>

      {making ? (
        <div className="br-colMaker">
          <div className="br-cmLab">Column name</div>
          <input className="br-cmIn" value={name} placeholder="Where it stands" onChange={(e) => setName(e.target.value)} />
          <div className="br-cmLab">What should this column answer?</div>
          <textarea className="br-cmIn br-tall" value={question} placeholder="Where does my case stand?" onChange={(e) => setQuestion(e.target.value)} />
          <p className="br-cmNote">It is asked of each matter separately through the same record-only door. A matter whose record cannot ground it says so in its own cell rather than borrowing another matter's answer.</p>
          <div className="br-cmFoot">
            <button className="br-gh" onClick={() => setMaking(false)}>Cancel</button>
            <button className="br-pr" disabled={running || !question.trim()} onClick={() => void run()}>
              {running ? "Running…" : `Run across ${Math.min(entities.length, 40)} matters`}
            </button>
          </div>
        </div>
      ) : null}

      <div className="br-grid">
        <div className="br-gr br-gh2" style={{ gridTemplateColumns: grid }}>
          <span>Matter</span>
          {cols.length ? cols.map((c) => <span key={c.name}>{c.name}</span>) : <span>No columns yet</span>}
        </div>
        {entities.slice(0, 40).map((e) => (
          <div key={e.id} className="br-gr" style={{ gridTemplateColumns: grid }}>
            <button className="br-gc br-strong br-linkish" onClick={() => onOpenMatter(e.id)}>{e.name}</button>
            {cols.length ? (
              cols.map((c) => {
                const v = cells[`${e.id}|${c.name}`];
                return (
                  <span key={c.name} className={v ? (v.understood ? "br-gc" : "br-gc br-warn") : "br-gc br-faint"}>
                    {v ? v.text : "—"}
                  </span>
                );
              })
            ) : (
              <span className="br-gc br-faint">Write a column to ask something of every matter</span>
            )}
          </div>
        ))}
      </div>
      <p className="br-gNote">
        A thread answers one question about one matter. The grid asks one question of the whole book —
        which is what working a book of matters actually needs.
      </p>
    </div>
  );
}

/* ---------- 4 — save, without promising a delivery ---------- */

function SaveModal({
  provider, tenant, caseId, question, onClose, onSaved,
}: {
  provider: LawDogProvider; tenant: string | null; caseId: string; question: string; onClose: () => void; onSaved: () => void;
}) {
  const [name, setName] = useState(question.slice(0, 60));
  const [cadence, setCadence] = useState("Weekly");
  const [day, setDay] = useState("Monday");
  const [time, setTime] = useState("7:00 AM");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    if (!tenant) { setErr("No tenant on record for this matter."); return; }
    setBusy(true);
    try {
      await provider.saveQuestion({ tenantId: tenant, caseId, name: name.trim() || question.slice(0, 60), question, cadence, dayOfWeek: day, timeOfDay: time });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <div className="br-modalWrap" onClick={onClose}>
      <div className="br-modal" onClick={(e) => e.stopPropagation()}>
        <div className="br-mT">Save this question</div>
        <div className="br-mLab">Name</div>
        <input className="br-mIn" value={name} onChange={(e) => setName(e.target.value)} />
        <div className="br-mLab">When you would want it</div>
        <div className="br-mRow">
          <select className="br-mSel" value={cadence} onChange={(e) => setCadence(e.target.value)}>
            <option>Daily</option><option>Weekly</option><option>Monthly</option>
          </select>
          <select className="br-mSel" value={day} onChange={(e) => setDay(e.target.value)}>
            <option>Monday</option><option>Tuesday</option><option>Wednesday</option><option>Thursday</option><option>Friday</option>
          </select>
          <select className="br-mSel" value={time} onChange={(e) => setTime(e.target.value)}>
            <option>7:00 AM</option><option>8:00 AM</option><option>12:00 PM</option><option>5:00 PM</option>
          </select>
        </div>
        <div className="br-mLab">The question it asks</div>
        <div className="br-mIn br-tall">{question}</div>
        <div className="br-mNote">
          Saved, not scheduled. Nothing runs this yet — there is no runner on this estate, so it will
          sit in your list until one exists. It is one click to ask it again in the meantime.
        </div>
        {err ? <div className="br-err">{err}</div> : null}
        <div className="br-mFoot">
          <button className="br-gh" onClick={onClose}>Cancel</button>
          <button className="br-pr" disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : "Save question"}</button>
        </div>
      </div>
    </div>
  );
}

const CSS = `
.br{--card:#FFF;--panel:#EDF0F4;--ink:#131820;--body:#59636F;--mute:#8A939E;--line:#E4E8ED;
 --blue:#2563EB;--blueSoft:#EFF4FF;--green:#0E9F6E;--rose:#DC2626;
 display:flex;height:100%;min-height:520px;background:#F4F6F8;color:var(--body);font-size:14px;line-height:1.6;}
.br *{box-sizing:border-box;}
.br-rail{width:250px;flex-shrink:0;background:var(--card);border-right:1px solid var(--line);padding:16px 12px;display:flex;flex-direction:column;gap:3px;overflow:auto;}
.br-newT{background:var(--blue);border:0;color:#fff;font:inherit;font-size:13px;font-weight:600;padding:9px;border-radius:8px;cursor:pointer;margin-bottom:16px;}
.br-railLab{font-size:11px;font-weight:650;color:var(--mute);letter-spacing:.05em;text-transform:uppercase;padding:0 8px 7px;}
.br-railEmpty{font-size:12.5px;color:var(--mute);padding:0 8px;margin:0;}
.br-th{background:none;border:0;text-align:left;padding:9px 10px;border-radius:8px;cursor:pointer;font:inherit;display:flex;flex-direction:column;gap:3px;}
.br-th:hover{background:var(--panel);} .br-th.on{background:var(--blueSoft);}
.br-thT{font-size:13px;color:var(--ink);line-height:1.35;}
.br-thM{font-size:11.5px;color:var(--mute);display:flex;align-items:center;gap:6px;}
.br-savedDot{width:6px;height:6px;border-radius:50%;background:var(--blue);display:inline-block;}
.br-mid{flex:1;min-width:0;display:flex;flex-direction:column;}
.br-midTop{display:flex;align-items:center;gap:14px;padding:13px 24px;background:var(--card);border-bottom:1px solid var(--line);}
.br-seg{display:flex;background:var(--panel);border-radius:8px;padding:3px;}
.br-sg{background:none;border:0;padding:6px 15px;border-radius:6px;font:inherit;font-size:12.5px;color:var(--body);cursor:pointer;}
.br-sg.on{background:var(--card);color:var(--ink);font-weight:600;box-shadow:0 1px 2px rgba(19,24,32,.08);}
.br-scope{font-size:12px;color:var(--mute);margin-left:auto;}
.br-scroll{padding:24px;max-width:860px;overflow:auto;flex:1;}
.br-memBar{background:var(--blueSoft);border:1px solid #C7D7FE;border-radius:10px;padding:11px 14px;font-size:12.5px;color:#1E3A8A;margin-bottom:22px;}
.br-turn{margin-bottom:26px;}
.br-q{font-size:19px;color:var(--ink);font-weight:650;letter-spacing:-.015em;line-height:1.3;margin-bottom:14px;}
.br-ans{display:flex;flex-direction:column;gap:13px;}
.br-ans p{margin:0;font-size:14.5px;line-height:1.65;display:flex;gap:10px;align-items:baseline;flex-wrap:wrap;}
.br-src{font-size:10.5px;font-weight:650;padding:3px 8px;border-radius:5px;flex-shrink:0;}
.br-src.measured{background:#ECFDF5;color:#047857;} .br-src.onrecord{background:var(--blueSoft);color:#1D4ED8;}
.br-src.ourread{background:#FEF3C7;color:#92400E;}
.br-cite{background:var(--blueSoft);border:1px solid #DBEAFE;color:#1D4ED8;font:inherit;font-size:11.5px;padding:2px 8px;border-radius:5px;cursor:pointer;white-space:nowrap;}
.br-cite:hover{background:#DBEAFE;}
.br-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:22px;padding-top:18px;border-top:1px solid var(--line);}
.br-gh{background:var(--card);border:1px solid var(--line);border-radius:8px;font:inherit;font-size:12.5px;color:var(--body);padding:8px 14px;cursor:pointer;}
.br-gh:hover{border-color:#C9D2DC;color:var(--ink);}
.br-pr{background:var(--blue);border:0;color:#fff;font:inherit;font-size:12.5px;font-weight:600;padding:8px 15px;border-radius:8px;cursor:pointer;}
.br-pr:disabled{opacity:.55;cursor:default;}
.br-relLab{font-size:11px;font-weight:650;color:var(--mute);letter-spacing:.05em;text-transform:uppercase;margin:20px 0 9px;}
.br-rel{display:block;width:100%;text-align:left;background:var(--card);border:1px solid var(--line);border-radius:8px;padding:10px 13px;font:inherit;font-size:13.5px;color:var(--blue);cursor:pointer;margin-bottom:7px;}
.br-rel:hover{background:var(--blueSoft);}
.br-askBox{margin-top:22px;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px;box-shadow:0 1px 3px rgba(19,24,32,.05);}
.br-askIn{width:100%;border:0;outline:0;font:inherit;font-size:14.5px;color:var(--ink);background:transparent;margin-bottom:12px;}
.br-askChips{display:flex;gap:7px;align-items:center;flex-wrap:wrap;}
.br-ch{font-size:11.5px;background:var(--panel);color:var(--body);padding:4px 10px;border-radius:6px;}
.br-chR{margin-left:auto;border:0;font:inherit;font-size:12px;font-weight:600;background:var(--ink);color:#fff;padding:6px 13px;border-radius:7px;cursor:pointer;}
.br-refused{background:#FEF2F2;border:1px solid #FECACA;border-radius:12px;padding:14px 16px;}
.br-refTop{display:flex;justify-content:space-between;gap:14px;margin-bottom:8px;}
.br-refQ{font-size:14px;color:#7F1D1D;} .br-refTag{font-size:11px;font-weight:650;color:var(--rose);background:#FEE2E2;padding:3px 9px;border-radius:5px;height:fit-content;}
.br-refused p{margin:0 0 10px;font-size:13.5px;color:#991B1B;}
.br-err{margin:12px 24px;background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;padding:10px 13px;font-size:12.5px;color:#991B1B;}
.br-gridHead{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:18px;}
.br-gTitle{font-size:19px;color:var(--ink);font-weight:650;letter-spacing:-.015em;}
.br-gSub{font-size:13px;color:var(--mute);margin-top:3px;}
.br-colMaker{background:var(--card);border:1px solid var(--blue);border-radius:12px;padding:16px;margin-bottom:16px;box-shadow:0 2px 10px rgba(37,99,235,.10);}
.br-cmLab{font-size:11px;font-weight:650;color:var(--mute);letter-spacing:.05em;text-transform:uppercase;margin-bottom:6px;}
.br-cmIn{width:100%;background:#F8FAFB;border:1px solid var(--line);border-radius:8px;padding:9px 12px;font:inherit;font-size:13.5px;color:var(--ink);margin-bottom:14px;}
.br-tall{min-height:62px;line-height:1.55;}
.br-cmNote{font-size:12.5px;color:var(--mute);margin:0 0 14px;max-width:70ch;}
.br-cmFoot{display:flex;gap:8px;justify-content:flex-end;}
.br-grid{background:var(--card);border:1px solid var(--line);border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(19,24,32,.05);}
.br-gr{display:grid;gap:14px;padding:12px 16px;border-bottom:1px solid #F1F4F7;font-size:13px;}
.br-gr:last-child{border-bottom:0;}
.br-gh2{background:#F8FAFB;font-size:11.5px;font-weight:650;color:var(--mute);border-bottom:1px solid var(--line);}
.br-gc{min-width:0;overflow-wrap:anywhere;}
.br-strong{color:var(--ink);font-weight:550;} .br-warn{color:var(--rose);} .br-faint{color:var(--mute);}
.br-linkish{background:none;border:0;padding:0;font:inherit;text-align:left;cursor:pointer;text-decoration:underline;}
.br-gNote{border-left:3px solid var(--blue);padding-left:14px;margin:18px 0 0;font-size:13.5px;max-width:70ch;}
@media(max-width:900px){.br-gr{grid-template-columns:1fr!important;gap:4px}.br-gh2{display:none}}
.br-doc{width:330px;flex-shrink:0;background:var(--card);border-left:1px solid var(--line);display:flex;flex-direction:column;}
.br-docTop{display:flex;justify-content:space-between;gap:12px;padding:15px 16px;border-bottom:1px solid var(--line);}
.br-docT{font-size:14px;color:var(--ink);font-weight:600;} .br-docM{font-size:11.5px;color:var(--mute);margin-top:3px;}
.br-x{background:none;border:0;color:var(--mute);font-size:15px;cursor:pointer;}
.br-docBody{padding:8px 0;flex:1;overflow:auto;}
.br-rec{padding:8px 16px;border-bottom:1px solid #F1F4F7;cursor:pointer;}
.br-rec.hl{background:#FEF9C3;box-shadow:inset 3px 0 0 #CA8A04;}
.br-dl{display:grid;grid-template-columns:96px 1fr;gap:10px;font-size:12.5px;}
.br-dk{color:var(--mute);} .br-dv{color:var(--ink);overflow-wrap:anywhere;}
.br-docFoot{padding:12px 16px;border-top:1px solid var(--line);font-size:11.5px;color:var(--mute);}
@media(max-width:1100px){.br-doc{display:none}}
.br-modalWrap{position:fixed;inset:0;background:rgba(19,24,32,.35);display:flex;align-items:center;justify-content:center;padding:20px;z-index:50;}
.br-modal{background:var(--card);border-radius:14px;padding:22px;width:100%;max-width:460px;box-shadow:0 12px 40px rgba(19,24,32,.22);}
.br-mT{font-size:17px;color:var(--ink);font-weight:650;margin-bottom:18px;}
.br-mLab{font-size:11px;font-weight:650;color:var(--mute);letter-spacing:.05em;text-transform:uppercase;margin-bottom:6px;}
.br-mIn{width:100%;background:#F8FAFB;border:1px solid var(--line);border-radius:8px;padding:9px 12px;font:inherit;font-size:13.5px;color:var(--ink);margin-bottom:15px;}
.br-mRow{display:flex;gap:8px;margin-bottom:15px;flex-wrap:wrap;}
.br-mSel{background:#F8FAFB;border:1px solid var(--line);border-radius:8px;padding:8px 13px;font:inherit;font-size:13px;color:var(--ink);}
.br-mNote{background:var(--blueSoft);border-radius:8px;padding:11px 13px;font-size:12.5px;color:#1D4ED8;margin-bottom:18px;}
.br-mFoot{display:flex;gap:8px;justify-content:flex-end;}
.br button:focus-visible,.br input:focus-visible,.br textarea:focus-visible{outline:2px solid var(--blue);outline-offset:2px;}
`;
