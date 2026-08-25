import { useCallback, useMemo, useState } from "react";
import type { LawDogProvider, LdMasterCaseDoc } from "@/data/lawdog-provider";
import {
  LD,
  LdEmpty,
  LdEnumPill,
  LdPill,
  LdAccentFigure,
  type LdTone,
  dateOnly,
  humanize,
  money,
  moneyRange,
} from "./ld-kit";
import { LdPanelFrame, type LdExplainCopy } from "./ld-panel-frame";
import { useLegalData } from "./use-legal-data";

/**
 * MASTER CASE DOCUMENT — the whole matter as one scrolling, printable binder.
 *
 * Ported from the Craig portal (craig-portal-vercel: Dashboard + "Build to"
 * exports) on Dave's word 2026-08-25, PATTERN ONLY: the carve-out estate's data
 * never crosses (precedent dd754327). What travelled: headline figures, fault-
 * ground readiness bars, strategic valence (what helps us / what hurts us, shown
 * openly), "weaknesses to close", and Word / CSV / Print exports.
 *
 * Every section states its own count (denominator rule). Nothing here is
 * estimated — the figures are the record's, read from one server-assembled row.
 */

const s = (v: unknown): string => (v === null || v === undefined ? "" : String(v));
const n = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
};

/** Which side a claim is on decides its colour. "For us" is green, "against us"
 *  is red, everything else stays neutral — a weakness is shown, never hidden. */
function sideTone(side: unknown): LdTone {
  const v = s(side).toLowerCase();
  if (["ours", "for", "plaintiff", "client", "us"].includes(v)) return "positive";
  if (["theirs", "against", "defendant", "opposing", "them"].includes(v)) return "critical";
  return "neutral";
}
function sideLabel(side: unknown): string {
  const t = sideTone(side);
  return t === "positive" ? "For us" : t === "critical" ? "Against us" : humanize(s(side)) || "Unsided";
}

function severityTone(sev: unknown): LdTone {
  const v = s(sev).toLowerCase();
  if (["critical", "high", "severe"].includes(v)) return "critical";
  if (["medium", "moderate"].includes(v)) return "attention";
  return "neutral";
}

/* ---------- small presentational pieces ---------- */

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section className="mcd-section border-t pt-3 mt-4" style={{ borderColor: LD.hairline }}>
      <div className="flex items-baseline gap-2 mb-2">
        <h3 className="text-[13px] font-medium" style={{ color: LD.ink }}>
          {title}
        </h3>
        {count !== undefined ? (
          <span className="font-mono text-[11px] tabular-nums" style={{ color: LD.inkFaint }}>
            {count}
          </span>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function Tile({ value, label, tone = "neutral" }: { value: string; label: string; tone?: LdTone }) {
  const fg = tone === "positive" ? "#1B7A4B" : tone === "critical" ? "#A03030" : LD.ink;
  return (
    <div className="rounded-[6px] border p-3" style={{ borderColor: LD.hairline, background: LD.wash }}>
      <div className="text-[20px] font-medium tabular-nums leading-none" style={{ color: fg }}>
        {value}
      </div>
      <div className="mt-1.5 text-[11px]" style={{ color: LD.inkMuted }}>
        {label}
      </div>
    </div>
  );
}

function Bar({ pct, tone }: { pct: number; tone: LdTone }) {
  const fill = tone === "positive" ? "#1B7A4B" : tone === "critical" ? "#A03030" : tone === "attention" ? "#8A6216" : LD.inkFaint;
  return (
    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: LD.hairline }}>
      <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: fill }} />
    </div>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  if (!v) return null;
  return (
    <div className="flex gap-3 text-[12px]">
      <span className="w-28 shrink-0" style={{ color: LD.inkFaint }}>
        {k}
      </span>
      <span className="break-words" style={{ color: LD.inkMuted }}>
        {v}
      </span>
    </div>
  );
}

/* ---------- strength: "0-10" or "0-100" both appear in the record ---------- */
function strengthPct(v: unknown): number | null {
  const x = n(v);
  if (x === null) return null;
  return x <= 10 ? x * 10 : x;
}

/* ---------- exports (client-side; nothing leaves the browser) ---------- */

function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
const esc = (v: unknown) =>
  s(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const csvCell = (v: unknown) => `"${s(v).replace(/"/g, '""')}"`;

export function masterCaseDocToCsv(d: LdMasterCaseDoc): string {
  const rows: unknown[][] = [["section", "a", "b", "c", "d", "e"]];
  rows.push(["matter", d.caseName, d.caseNumber, d.court, d.caseState, d.status]);
  d.parties.forEach((p) => rows.push(["party", p.role, p.name, p.entity_type, p.counsel_name, p.is_client ? "client" : ""]));
  d.claims.forEach((c) => rows.push(["claim", c.code, c.name, c.side, c.score, c.status]));
  d.faultGrounds.forEach((g) => rows.push(["fault_ground", g.statute, g.ground, g.strength, g.effect, g.key_evidence]));
  d.allegations.forEach((a) => rows.push(["allegation", a.severity, a.category, a.allegation, a.the_record, a.disposition]));
  d.timeline.forEach((t) => rows.push(["timeline", t.date, t.phase, t.actor, t.type, t.description]));
  d.documents.forEach((x) => rows.push(["document", x.category, x.filename, x.doc_type, x.status, x.description]));
  d.exhibits.forEach((x) => rows.push(["exhibit", x.ref, x.name, x.claim_code, x.status, x.needs_subpoena ? "needs subpoena" : ""]));
  d.subpoenas.forEach((x) => rows.push(["subpoena", x.no, x.target, x.priority, x.status, x.what_it_proves]));
  d.nextMoves.forEach((x) => rows.push(["next_move", x.seq, x.code, x.what_we_found, x.remedy, x.status]));
  d.openTasks.forEach((x) => rows.push(["open_task", x.due, x.priority, x.phase, x.name, x.owner]));
  return rows.map((r) => r.map(csvCell).join(",")).join("\n");
}

export function masterCaseDocToWordHtml(d: LdMasterCaseDoc): string {
  const li = (items: string[]) => (items.length ? `<ul>${items.map((x) => `<li>${x}</li>`).join("")}</ul>` : "<p><i>None recorded.</i></p>");
  const h = (t: string, c: number) => `<h2>${esc(t)} <span style="font-weight:normal;color:#777">(${c})</span></h2>`;
  let html = `<html xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>${esc(d.caseName)}</title></head><body style="font-family:Calibri,Arial;font-size:11pt">`;
  html += `<h1>${esc(d.caseName)}</h1><p><i>Master case document · ${esc(d.caseNumber ?? "")}${d.court ? " · " + esc(d.court) : ""}</i></p>`;
  html += `<p>${esc(d.status ?? "")}</p>${d.posture ? `<p><b>Posture:</b> ${esc(d.posture)}</p>` : ""}`;
  html += `<p><b>Client:</b> ${esc(d.clientName ?? "")} &nbsp; <b>Opposing:</b> ${esc(d.opposingParty ?? "")} &nbsp; <b>Counsel:</b> ${esc(d.attorney ?? "")}</p>`;
  html += `<p><b>Documented:</b> ${esc(money(d.totalDocumented))} &nbsp; <b>Recovery range:</b> ${esc(moneyRange(d.recoveryLow, d.recoveryHigh))} &nbsp; <b>Strength:</b> ${d.caseStrength ?? "—"}</p>`;
  html += h("Parties", d.parties.length) + li(d.parties.map((p) => `<b>${esc(p.role)}</b> — ${esc(p.name)}${p.counsel_name ? ` (counsel: ${esc(p.counsel_name)})` : ""}`));
  html += h("Claims", d.claims.length) + li(d.claims.map((c) => `<b style="color:${sideTone(c.side) === "positive" ? "#1B7A4B" : sideTone(c.side) === "critical" ? "#A03030" : "#444"}">[${esc(sideLabel(c.side))}]</b> ${esc(c.code)} ${esc(c.name)}${c.score !== null && c.score !== undefined ? ` — ${esc(c.score)}/${esc(c.max_score ?? "")}` : ""}${c.narrative ? `<br/>${esc(c.narrative)}` : ""}`));
  html += h("Fault grounds", d.faultGrounds.length) + li(d.faultGrounds.map((g) => `<b>${esc(g.statute)}</b> ${esc(g.ground)} — ${esc(g.strength ?? "")}${g.effect ? `<br/>${esc(g.effect)}` : ""}`));
  html += h("Allegations and the record", d.allegations.length) + li(d.allegations.map((a) => `<b>${esc(a.severity)}</b> ${esc(a.allegation)}${a.the_record ? `<br/><i>The record:</i> ${esc(a.the_record)}` : ""}`));
  html += h("Timeline", d.timeline.length) + li(d.timeline.map((t) => `<b>${esc(t.date)}</b> ${esc(t.actor)} — ${esc(t.type)}: ${esc(t.description)}`));
  html += h("Documents", d.documents.length) + li(d.documents.map((x) => `${esc(x.filename)} <i>(${esc(x.category)} · ${esc(x.status)})</i>`));
  html += h("Exhibits", d.exhibits.length) + li(d.exhibits.map((x) => `<b>${esc(x.ref)}</b> ${esc(x.name)} <i>(${esc(x.status)})</i>`));
  html += h("Subpoenas", d.subpoenas.length) + li(d.subpoenas.map((x) => `<b>#${esc(x.no)}</b> ${esc(x.target)} — ${esc(x.status)}${x.what_it_proves ? `<br/>${esc(x.what_it_proves)}` : ""}`));
  html += h("Next moves", d.nextMoves.length) + li(d.nextMoves.map((x) => `<b>${esc(x.seq)}</b> ${esc(x.what_we_found)}${x.remedy ? `<br/><i>Remedy:</i> ${esc(x.remedy)}` : ""}`));
  html += h("Open tasks", d.openTasks.length) + li(d.openTasks.map((x) => `${x.due ? `<b>${esc(x.due)}</b> ` : ""}${esc(x.name)}${x.owner ? ` — ${esc(x.owner)}` : ""}`));
  html += `<p style="font-size:9pt;color:#777">Assembled from the matter record. Counts are the record's, not estimates.</p></body></html>`;
  return html;
}

export function ExportBar({ d }: { d: LdMasterCaseDoc }) {
  const base = (d.slug || "matter").replace(/[^a-z0-9_-]+/gi, "_");
  const btn = "rounded-[6px] border px-2.5 py-1 text-[12px] hover:bg-[#F5F5F6]";
  return (
    <div className="mcd-exports flex flex-wrap items-center gap-2 px-3 pt-3">
      <span className="text-[11px] uppercase tracking-wide" style={{ color: LD.inkFaint }}>
        Build to
      </span>
      <button className={btn} style={{ borderColor: LD.hairline, color: LD.ink }} onClick={() => download(`${base}_master_case.doc`, masterCaseDocToWordHtml(d), "application/msword")}>
        Word
      </button>
      <button className={btn} style={{ borderColor: LD.hairline, color: LD.ink }} onClick={() => download(`${base}_master_case.csv`, masterCaseDocToCsv(d), "text/csv")}>
        Spreadsheet
      </button>
      <button className={btn} style={{ borderColor: LD.hairline, color: LD.ink }} onClick={() => window.print()}>
        PDF / Print
      </button>
    </div>
  );
}

/* ---------- the view ---------- */

export function MasterCaseDocView({ d }: { d: LdMasterCaseDoc }) {
  const [openTl, setOpenTl] = useState(false);
  const [openDocs, setOpenDocs] = useState(false);
  const [openTasks, setOpenTasks] = useState(false);

  const claimsFor = d.claims.filter((c) => sideTone(c.side) === "positive");
  const claimsAgainst = d.claims.filter((c) => sideTone(c.side) === "critical");
  const weaknesses = useMemo(
    () => [
      ...claimsAgainst.map((c) => ({ title: `${s(c.code)} ${s(c.name)}`.trim(), why: s(c.legal_effect || c.narrative), kind: "Claim against us" })),
      ...d.allegations
        .filter((a) => severityTone(a.severity) === "critical" && !/(resolved|rebutted|closed|withdrawn)/i.test(s(a.disposition)))
        .map((a) => ({ title: s(a.allegation), why: s(a.the_record), kind: `Allegation · ${humanize(s(a.severity))}` })),
      ...d.exhibits.filter((x) => x.needs_subpoena).map((x) => ({ title: `${s(x.ref)} ${s(x.name)}`.trim(), why: "Cannot be authenticated without a subpoena.", kind: "Exhibit gap" })),
    ],
    [claimsAgainst, d.allegations, d.exhibits]
  );

  const tl = openTl ? d.timeline : d.timeline.slice(-12);
  const docs = openDocs ? d.documents : d.documents.slice(0, 12);
  const tasks = openTasks ? d.openTasks : d.openTasks.slice(0, 10);

  return (
    <div className="mcd px-3 pb-4">
      {/* header */}
      <div className="pt-3">
        <div className="text-[15px] font-medium" style={{ color: LD.ink }}>
          {d.caseName}
        </div>
        <div className="mt-0.5 text-[12px]" style={{ color: LD.inkMuted }}>
          {[d.caseNumber, d.court?.split(" — ")[0]].filter(Boolean).join(" · ")}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <LdEnumPill value={d.caseState} kind="status" />
          {d.matterType ? <LdPill label={humanize(d.matterType)} /> : null}
          {d.representation ? <LdPill label={humanize(d.representation)} /> : null}
        </div>
        {d.posture ? (
          <p className="mt-2 text-[12px]" style={{ color: LD.inkMuted }}>
            {d.posture}
          </p>
        ) : null}
      </div>

      {/* headline numbers — the record's, not estimates */}
      <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
        <div className="rounded-[6px] border p-3" style={{ borderColor: LD.hairline, background: LD.wash }}>
          <LdAccentFigure>{moneyRange(d.recoveryLow, d.recoveryHigh)}</LdAccentFigure>
          <div className="mt-1.5 text-[11px]" style={{ color: LD.inkMuted }}>
            Recovery range
          </div>
        </div>
        <Tile value={money(d.totalDocumented)} label="Documented total" tone={d.totalDocumented ? "positive" : "neutral"} />
        <Tile value={d.caseStrength === null ? "—" : `${d.caseStrength}`} label="Case strength" />
        <Tile value={`${d.counts.timeline ?? 0}`} label="Timeline entries" />
      </div>

      {/* valence — shown openly, never hidden from our own side */}
      {d.claims.length > 0 ? (
        <Section title="Where the claims sit" count={d.claims.length}>
          <div className="flex h-2 overflow-hidden rounded-full" style={{ background: LD.hairline }}>
            <div style={{ width: `${(claimsFor.length / d.claims.length) * 100}%`, background: "#1B7A4B" }} />
            <div style={{ width: `${((d.claims.length - claimsFor.length - claimsAgainst.length) / d.claims.length) * 100}%`, background: LD.inkFaint }} />
            <div style={{ width: `${(claimsAgainst.length / d.claims.length) * 100}%`, background: "#A03030" }} />
          </div>
          <div className="mt-1.5 flex gap-4 text-[12px]">
            <span style={{ color: "#1B7A4B" }}>● {claimsFor.length} for us</span>
            <span style={{ color: LD.inkMuted }}>● {d.claims.length - claimsFor.length - claimsAgainst.length} unsided</span>
            <span style={{ color: "#A03030" }}>● {claimsAgainst.length} against us</span>
          </div>
          <ul className="mt-2 flex flex-col gap-1.5">
            {d.claims.map((c, i) => {
              const pct = n(c.score) !== null && n(c.max_score) ? (n(c.score)! / n(c.max_score)!) * 100 : null;
              return (
                <li key={i} className="rounded-[6px] border p-2.5" style={{ borderColor: LD.hairline }}>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-mono text-[11px]" style={{ color: LD.inkFaint }}>
                      {s(c.code)}
                    </span>
                    <span className="text-[13px] font-medium" style={{ color: LD.ink }}>
                      {s(c.name)}
                    </span>
                    <span className="ml-auto flex items-center gap-1.5">
                      <LdPill label={sideLabel(c.side)} tone={sideTone(c.side)} />
                      <LdEnumPill value={s(c.status)} kind="status" />
                    </span>
                  </div>
                  {pct !== null ? (
                    <div className="mt-1.5">
                      <Bar pct={pct} tone={sideTone(c.side)} />
                    </div>
                  ) : null}
                  {c.narrative ? (
                    <p className="mt-1.5 text-[12px]" style={{ color: LD.inkMuted }}>
                      {s(c.narrative)}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </Section>
      ) : null}

      {/* fault-ground readiness */}
      {d.faultGrounds.length > 0 ? (
        <Section title="Fault-ground readiness" count={d.faultGrounds.length}>
          <ul className="flex flex-col gap-2">
            {d.faultGrounds.map((g, i) => {
              const pct = strengthPct(g.strength);
              return (
                <li key={i}>
                  <div className="flex items-baseline justify-between gap-2 text-[12px]">
                    <span style={{ color: LD.ink }}>
                      <span className="font-mono">{s(g.statute)}</span> {s(g.ground)}
                    </span>
                    <span className="font-mono tabular-nums" style={{ color: pct !== null && pct >= 70 ? "#1B7A4B" : LD.inkMuted }}>
                      {pct !== null ? `${Math.round(pct)}%` : humanize(s(g.strength)) || "—"}
                    </span>
                  </div>
                  {g.effect ? (
                    <p className="mb-1 text-[11px]" style={{ color: LD.inkMuted }}>
                      {s(g.effect)}
                    </p>
                  ) : null}
                  <Bar pct={pct ?? 0} tone={pct !== null && pct >= 70 ? "positive" : pct !== null && pct >= 40 ? "attention" : "neutral"} />
                </li>
              );
            })}
          </ul>
        </Section>
      ) : null}

      {/* weaknesses to close */}
      <Section title="Weaknesses to close" count={weaknesses.length}>
        {weaknesses.length === 0 ? (
          <LdEmpty line="Nothing in the record is scored against us right now." />
        ) : (
          <ul className="flex flex-col gap-1.5">
            {weaknesses.map((w, i) => (
              <li key={i} className="rounded-[6px] border p-2.5" style={{ borderColor: "#F3DADA", background: "#FDF6F6" }}>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[13px] font-medium" style={{ color: "#A03030" }}>
                    {w.title}
                  </span>
                  <span className="ml-auto text-[11px]" style={{ color: LD.inkFaint }}>
                    {w.kind}
                  </span>
                </div>
                {w.why ? (
                  <p className="mt-1 text-[12px]" style={{ color: LD.inkMuted }}>
                    {w.why}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* parties */}
      <Section title="People" count={d.parties.length}>
        {d.parties.length === 0 ? (
          <div className="flex flex-col gap-1">
            <KV k="Client" v={s(d.clientName)} />
            <KV k="Opposing" v={s(d.opposingParty)} />
            <KV k="Counsel" v={s(d.attorney)} />
            <KV k="Judge" v={s(d.judge)} />
          </div>
        ) : (
          <ul className="flex flex-col gap-1">
            {d.parties.map((p, i) => (
              <li key={i} className="flex flex-wrap items-baseline gap-2 text-[12px]">
                <span className="w-28 shrink-0" style={{ color: LD.inkFaint }}>
                  {humanize(s(p.role))}
                </span>
                <span style={{ color: LD.ink }}>{s(p.name)}</span>
                {p.is_client ? <LdPill label="Client" tone="positive" /> : null}
                {p.counsel_name ? (
                  <span style={{ color: LD.inkMuted }}>· counsel {s(p.counsel_name)}</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* allegations vs record */}
      {d.allegations.length > 0 ? (
        <Section title="What they allege, and what the record says" count={d.allegations.length}>
          <ul className="flex flex-col gap-1.5">
            {d.allegations.map((a, i) => (
              <li key={i} className="rounded-[6px] border p-2.5" style={{ borderColor: LD.hairline }}>
                <div className="flex flex-wrap items-center gap-1.5">
                  <LdPill label={humanize(s(a.severity)) || "Unrated"} tone={severityTone(a.severity)} />
                  {a.category ? <LdPill label={humanize(s(a.category))} /> : null}
                  {a.disposition ? <span className="ml-auto text-[11px]" style={{ color: LD.inkFaint }}>{humanize(s(a.disposition))}</span> : null}
                </div>
                <p className="mt-1.5 text-[13px]" style={{ color: LD.ink }}>
                  {s(a.allegation)}
                </p>
                {a.the_record ? (
                  <p className="mt-1 text-[12px]" style={{ color: LD.inkMuted }}>
                    <span style={{ color: LD.inkFaint }}>The record: </span>
                    {s(a.the_record)}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {/* next moves */}
      {d.nextMoves.length > 0 ? (
        <Section title="Next moves" count={d.nextMoves.length}>
          <ol className="flex flex-col gap-1.5">
            {d.nextMoves.map((m, i) => (
              <li key={i} className="flex gap-2 text-[12px]">
                <span className="font-mono w-6 shrink-0" style={{ color: LD.inkFaint }}>
                  {s(m.seq) || i + 1}
                </span>
                <div className="min-w-0">
                  <div style={{ color: LD.ink }}>{s(m.what_we_found)}</div>
                  {m.remedy ? (
                    <div style={{ color: LD.inkMuted }}>
                      <span style={{ color: LD.inkFaint }}>Remedy: </span>
                      {s(m.remedy)}
                    </div>
                  ) : null}
                </div>
                <span className="ml-auto shrink-0">
                  <LdEnumPill value={s(m.status)} kind="status" />
                </span>
              </li>
            ))}
          </ol>
        </Section>
      ) : null}

      {/* subpoenas */}
      {d.subpoenas.length > 0 ? (
        <Section title="Records we asked for" count={d.subpoenas.length}>
          <ul className="flex flex-col gap-1">
            {d.subpoenas.map((x, i) => (
              <li key={i} className="flex flex-wrap items-baseline gap-2 text-[12px]">
                <span className="font-mono" style={{ color: LD.inkFaint }}>
                  #{s(x.no) || "—"}
                </span>
                <span style={{ color: LD.ink }}>{s(x.target)}</span>
                <span className="ml-auto flex items-center gap-1.5">
                  <LdEnumPill value={s(x.priority)} kind="priority" />
                  <LdEnumPill value={s(x.status)} kind="status" />
                </span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {/* timeline */}
      <Section title="Timeline" count={d.timeline.length}>
        {d.timeline.length === 0 ? (
          <LdEmpty line="No timeline entries recorded." />
        ) : (
          <>
            {!openTl && d.timeline.length > 12 ? (
              <button className="mb-2 text-[12px] underline" style={{ color: LD.inkMuted }} onClick={() => setOpenTl(true)}>
                Showing the last 12 of {d.timeline.length} — show all
              </button>
            ) : null}
            <ul className="flex flex-col gap-1.5">
              {tl.map((t, i) => (
                <li key={i} className="flex gap-3 text-[12px]">
                  <span className="font-mono w-20 shrink-0 tabular-nums" style={{ color: LD.inkFaint }}>
                    {dateOnly(s(t.date))}
                  </span>
                  <div className="min-w-0">
                    <span style={{ color: LD.ink }}>
                      {[s(t.actor), s(t.type)].filter(Boolean).join(" — ")}
                    </span>
                    {t.description ? (
                      <span style={{ color: LD.inkMuted }}>: {s(t.description)}</span>
                    ) : null}
                    {t.amount ? (
                      <span className="font-mono ml-1" style={{ color: LD.inkMuted }}>
                        {money(n(t.amount))}
                      </span>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </Section>

      {/* documents */}
      <Section title="Documents" count={d.documents.length}>
        {d.documents.length === 0 ? (
          <LdEmpty line="No documents recorded." />
        ) : (
          <>
            <ul className="flex flex-col gap-1">
              {docs.map((x, i) => (
                <li key={i} className="flex flex-wrap items-baseline gap-2 text-[12px]">
                  <span className="w-28 shrink-0 truncate" style={{ color: LD.inkFaint }}>
                    {humanize(s(x.category)) || "Uncategorised"}
                  </span>
                  <span className="min-w-0 truncate" style={{ color: LD.ink }}>
                    {s(x.filename)}
                  </span>
                  <span className="ml-auto">
                    <LdEnumPill value={s(x.status)} kind="status" />
                  </span>
                </li>
              ))}
            </ul>
            {!openDocs && d.documents.length > 12 ? (
              <button className="mt-2 text-[12px] underline" style={{ color: LD.inkMuted }} onClick={() => setOpenDocs(true)}>
                Showing 12 of {d.documents.length} — show all
              </button>
            ) : null}
          </>
        )}
      </Section>

      {/* exhibits */}
      {d.exhibits.length > 0 ? (
        <Section title="Exhibits" count={d.exhibits.length}>
          <ul className="flex flex-col gap-1">
            {d.exhibits.map((x, i) => (
              <li key={i} className="flex flex-wrap items-baseline gap-2 text-[12px]">
                <span className="font-mono" style={{ color: LD.inkFaint }}>
                  {s(x.ref)}
                </span>
                <span style={{ color: LD.ink }}>{s(x.name)}</span>
                {x.needs_subpoena ? <LdPill label="Needs subpoena" tone="attention" /> : null}
                <span className="ml-auto">
                  <LdEnumPill value={s(x.status)} kind="status" />
                </span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {/* open tasks */}
      <Section title="Open tasks" count={d.openTasks.length}>
        {d.openTasks.length === 0 ? (
          <LdEmpty line="No open tasks." />
        ) : (
          <>
            <ul className="flex flex-col gap-1">
              {tasks.map((x, i) => (
                <li key={i} className="flex flex-wrap items-baseline gap-2 text-[12px]">
                  <span className="font-mono w-20 shrink-0 tabular-nums" style={{ color: LD.inkFaint }}>
                    {dateOnly(s(x.due))}
                  </span>
                  <span className="min-w-0" style={{ color: LD.ink }}>
                    {s(x.name)}
                  </span>
                  <span className="ml-auto flex items-center gap-1.5">
                    {x.phase ? <LdPill label={humanize(s(x.phase))} /> : null}
                    <LdEnumPill value={s(x.priority)} kind="priority" />
                  </span>
                </li>
              ))}
            </ul>
            {!openTasks && d.openTasks.length > 10 ? (
              <button className="mt-2 text-[12px] underline" style={{ color: LD.inkMuted }} onClick={() => setOpenTasks(true)}>
                Showing 10 of {d.openTasks.length} — show all
              </button>
            ) : null}
          </>
        )}
      </Section>

      <p className="mt-4 text-[11px]" style={{ color: LD.inkFaint }}>
        Assembled from the matter record · every count above is the record's, not an estimate · updated {dateOnly(d.updatedAt)}
      </p>

      <style>{`@media print { .mcd-exports { display:none } .mcd { padding:0 } }`}</style>
    </div>
  );
}

export const MASTER_CASE_DOC_EXPLAIN: LdExplainCopy = {
  what: "The whole matter as one document: what we can recover, which claims help us and which hurt us, what still needs closing, and everything the record holds — people, allegations, timeline, documents, subpoenas, next moves.",
  next: "Read the weaknesses first, then build it to Word or print it for counsel.",
  nextWhenEmpty: "Pick a matter and the document assembles from its record.",
};

export function MasterCaseDocPanel() {
  const load = useCallback(
    (provider: LawDogProvider, entityId: string | null) => provider.getMasterCaseDoc(entityId ?? ""),
    []
  );
  const { state, entityName } = useLegalData<LdMasterCaseDoc | null>(load);

  return (
    <LdPanelFrame
      title="Master case document"
      subject="the master case document"
      meta={entityName}
      state={state}
      explain={MASTER_CASE_DOC_EXPLAIN}
      render={(d) => (d ? <><ExportBar d={d} /><MasterCaseDocView d={d} /></> : <LdEmpty line="This matter has no record row yet." />)}
    />
  );
}
