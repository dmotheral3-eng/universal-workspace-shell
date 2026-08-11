import type { DataProvider, Entity, Item, Document, DocSection, Stage, Metric } from "./types";
import { getAccessToken } from "./lawdog-auth";

/**
 * Law Dog data adapter.
 *
 * Talks to PostgREST directly with fetch — deliberately no @supabase/supabase-js,
 * so this adds ZERO dependencies to the shell.
 *
 * STORE SWITCH. Two Law Dog stores exist and they are not interchangeable:
 *   "case"  → aryjtzlawkbazvqsjozf, schema public. Flat, single-matter, no tenancy.
 *             This is the dave-legal carve-out (Kelly v. Motheral lives here by
 *             ruling 2026-08-06: "lawdog is all legal stuff except for dave-legal").
 *             The PRODUCT never points here.
 *   "cube"  → aryjtzlawkbazvqsjozf, schema legal (PostgREST profile "legal").
 *             24 ld_* tables, tenant-scoped, FORCE RLS. THE PRODUCT STORE.
 *             (Historical note: "cube" once named iofslupbvedjzmfmkdvx; the legal
 *             estate consolidated onto aryjtz 2026-08-05. The store token kept its
 *             name so configs did not churn.)
 *
 * COLUMN REALITY (why the mapping below is store-conditional — read live from
 * information_schema 2026-08-06, do not "simplify" back to shared names):
 *   public.cases            PK id        · legal.ld_cases            PK case_id (NO id)
 *   public.timeline_events  who          · legal.ld_timeline_events  actor
 *   public.timeline_events  evidence_source
 *                                        · legal.ld_timeline_events  provenance_ref /
 *                                          provenance_kind / provenance_note
 *   public.documents        completeness, completeness_basis,
 *                           completeness_attested_at, source
 *                                        · legal.ld_documents        has NONE of those;
 *                                          it has status (collected|complete|draft|filed|served),
 *                                          version, assignee, external_url
 *
 * AUTH REALITY: anon has NO grant on any legal.ld_* table. With a bare anon key the
 * cube store returns zero rows BY DESIGN — reads require an authenticated GoTrue
 * session (lawdog-auth). Do not "fix" empty results by touching the database.
 */

export type LawDogStore = "case" | "cube";

export interface LawDogConfig {
  store: LawDogStore;
  url: string;      // https://<ref>.supabase.co
  anonKey: string;  // anon key only — RLS does the work. Never a service key.
  caseId?: string;  // optional: pin the workspace to one matter
}

const DOMAINS = [
  "chronology",
  "authenticity_and_metadata",
  "entity_and_capacity",
  "element_mapping",
  "damages_and_math",
  "mitigation",
  "absence_and_negative_proof",
  "privilege_and_PII",
  "production_and_exhibit_readiness",
  "impeachment_and_prior_inconsistency",
] as const;

export type CoverageDomain = (typeof DOMAINS)[number];

/** ld_documents.status values that mean the document's content is settled
 *  (vocabulary read live from legal.ld_documents 2026-08-06 — collected, complete,
 *  draft, filed, served). Weaker than public's attestation; labelled as such. */
const CUBE_SETTLED_DOC_STATUSES = ["complete", "filed", "served"] as const;

/** task statuses that count as closed, shared across stores. legal.ld_tasks
 *  currently carries in_force | open | todo (live read) — none closed yet; that is
 *  a data fact, not a mapping defect. */
const CLOSED_TASK_STATUSES = ["complete", "done", "closed"] as const;

export interface CoverageCell {
  docId: string;
  docKey: string;      // 8-char prefix, the citation form used across the file
  filename: string;
  category: string | null;
  /** public: documents.completeness · cube: ld_documents.status (no attestation
   *  concept exists on the cube store — this cell carries whichever the store has). */
  completeness: string | null;
  citedById: boolean;  // ID appears somewhere in the timeline corpus
  domains: Record<CoverageDomain, boolean>;
}

type Row = Record<string, unknown>;

// ---- legal-schema panel tables ----------------------------------------------
//
// Column lists below were read live from the legal schema on 2026-08-09. They are
// the contract these types encode — do not widen a field on a hunch, and do not
// assume a case_id exists just because its neighbours have one:
//
//   ld_parties        case-scoped
//   ld_rate_card      TENANT-level. NO case_id column. Row security scopes it.
//   ld_savings_ledger case-scoped
//   ld_subpoenas      case-scoped
//   ld_claim_math     keys on claim_id, NOT case_id
//   ld_recovery_math  case-scoped
//
// All six live on the cube store only. The case store has no ld_* tables at all,
// so every fetcher below returns [] there rather than issuing a doomed request.

/** PostgREST hands numerics back as numbers, but a numeric arriving as a string
 *  (driver/proxy variation) must not turn a panel into NaN soup — coerce, and
 *  return null for anything that is not a finite number. */
function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v);
  return s === "" ? null : s;
}

function bool(v: unknown): boolean {
  return v === true || v === "true" || v === "t" || v === 1 || v === "1";
}

export interface LdParty {
  id: string;
  caseId: string | null;
  role: string | null;
  name: string;
  entityType: string | null;
  counselName: string | null;
  counselBarNo: string | null;
  counselEmail: string | null;
  isClient: boolean;
  notes: string | null;
  sortOrder: number | null;
}

export interface LdRate {
  id: string;
  role: string | null;
  hourlyRate: number | null;
  locale: string | null;
  basis: string | null;
}

export interface LdSaving {
  id: string;
  caseId: string | null;
  actionKey: string | null;
  actionLabel: string | null;
  hoursDisplaced: number | null;
  rateUsed: number | null;
  dollarsSaved: number | null;
  estimateBasis: string | null;
  isEstimate: boolean;
  occurredAt: string | null;
  sessionRef: string | null;
}

export interface LdSubpoena {
  id: string;
  caseId: string | null;
  subpoenaNo: number | null;
  target: string | null;
  targetType: string | null;
  whatItGets: string | null;
  whatItProves: string | null;
  legalImpact: string | null;
  jurisdiction: string | null;
  priority: string | null;
  filingDay: string | null;
  estCostLow: number | null;
  estCostHigh: number | null;
  status: string | null;
  filedDate: string | null;
  responseDate: string | null;
}

export interface LdClaimMath {
  id: string;
  claimId: string | null;
  amountTarget: number | null;
  amountLow: number | null;
  amountHigh: number | null;
  lineItems: unknown;
  methodology: string | null;
  createdAt: string | null;
}

/** One claim_id's worth of claim math. A claim can carry more than one row
 *  (successive calculations); newest first. */
export interface LdClaimGroup {
  claimId: string;
  rows: LdClaimMath[];
}

export interface LdRecoveryMath {
  id: string;
  caseId: string | null;
  combinedLow: number | null;
  combinedMid: number | null;
  combinedHigh: number | null;
  breakdown: unknown;
  methodology: string | null;
  lastCalculated: string | null;
  createdAt: string | null;
}

export function mapPartyRow(r: Row): LdParty {
  return {
    id: String(r.id),
    caseId: str(r.case_id),
    role: str(r.role),
    name: str(r.name) ?? "(unnamed)",
    entityType: str(r.entity_type),
    counselName: str(r.counsel_name),
    counselBarNo: str(r.counsel_bar_no),
    counselEmail: str(r.counsel_email),
    isClient: bool(r.is_client),
    notes: str(r.notes),
    sortOrder: num(r.sort_order),
  };
}

export function mapRateRow(r: Row): LdRate {
  return {
    id: String(r.id),
    role: str(r.role),
    hourlyRate: num(r.hourly_rate),
    locale: str(r.locale),
    basis: str(r.basis),
  };
}

export function mapSavingRow(r: Row): LdSaving {
  return {
    id: String(r.id),
    caseId: str(r.case_id),
    actionKey: str(r.action_key),
    actionLabel: str(r.action_label),
    hoursDisplaced: num(r.hours_displaced),
    rateUsed: num(r.rate_used),
    dollarsSaved: num(r.dollars_saved),
    estimateBasis: str(r.estimate_basis),
    isEstimate: bool(r.is_estimate),
    occurredAt: str(r.occurred_at),
    sessionRef: str(r.session_ref),
  };
}

export function mapSubpoenaRow(r: Row): LdSubpoena {
  return {
    id: String(r.id),
    caseId: str(r.case_id),
    subpoenaNo: num(r.subpoena_no),
    target: str(r.target),
    targetType: str(r.target_type),
    whatItGets: str(r.what_it_gets),
    whatItProves: str(r.what_it_proves),
    legalImpact: str(r.legal_impact),
    jurisdiction: str(r.jurisdiction),
    priority: str(r.priority),
    filingDay: str(r.filing_day),
    estCostLow: num(r.est_cost_low),
    estCostHigh: num(r.est_cost_high),
    status: str(r.status),
    filedDate: str(r.filed_date),
    responseDate: str(r.response_date),
  };
}

export function mapClaimMathRow(r: Row): LdClaimMath {
  return {
    id: String(r.id),
    claimId: str(r.claim_id),
    amountTarget: num(r.amount_target),
    amountLow: num(r.amount_low),
    amountHigh: num(r.amount_high),
    lineItems: r.line_items ?? null,
    methodology: str(r.methodology),
    createdAt: str(r.created_at),
  };
}

export function mapRecoveryMathRow(r: Row): LdRecoveryMath {
  return {
    id: String(r.id),
    caseId: str(r.case_id),
    combinedLow: num(r.combined_low),
    combinedMid: num(r.combined_mid),
    combinedHigh: num(r.combined_high),
    breakdown: r.breakdown ?? null,
    methodology: str(r.methodology),
    lastCalculated: str(r.last_calculated),
    createdAt: str(r.created_at),
  };
}

/** Group claim math by claim_id, newest row first inside each group, groups in
 *  stable claim_id order. Exported pure so fixtures can exercise it. */
export function groupClaimMath(rows: LdClaimMath[]): LdClaimGroup[] {
  const byClaim = new Map<string, LdClaimMath[]>();
  for (const row of rows) {
    const key = row.claimId ?? "(unassigned)";
    const bucket = byClaim.get(key);
    if (bucket) bucket.push(row);
    else byClaim.set(key, [row]);
  }
  return [...byClaim.entries()]
    .map(([claimId, group]) => ({
      claimId,
      rows: [...group].sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? ""))),
    }))
    .sort((a, b) => a.claimId.localeCompare(b.claimId));
}

/** sort_order first (nulls last, they are unranked not zero), then name. */
export function sortParties(rows: LdParty[]): LdParty[] {
  return [...rows].sort((a, b) => {
    const ao = a.sortOrder ?? Number.MAX_SAFE_INTEGER;
    const bo = b.sortOrder ?? Number.MAX_SAFE_INTEGER;
    if (ao !== bo) return ao - bo;
    return a.name.localeCompare(b.name);
  });
}

/** Parties grouped by role, groups ordered by their lowest sort_order. */
export function groupPartiesByRole(rows: LdParty[]): { role: string; parties: LdParty[] }[] {
  const byRole = new Map<string, LdParty[]>();
  for (const p of sortParties(rows)) {
    const key = p.role ?? "Unspecified role";
    const bucket = byRole.get(key);
    if (bucket) bucket.push(p);
    else byRole.set(key, [p]);
  }
  return [...byRole.entries()].map(([role, parties]) => ({ role, parties }));
}

// ---- pure per-store mappers (exported for fixture testing) -------------------

export function rowCaseId(store: LawDogStore, r: Row): string {
  return String(store === "cube" ? r.case_id : r.id);
}

export function rowActor(store: LawDogStore, r: Row): string {
  return String((store === "cube" ? r.actor : r.who) ?? "");
}

/** cube: compose provenance_kind:provenance_ref (+ note) · case: evidence_source verbatim */
export function rowProvenance(store: LawDogStore, r: Row): string | undefined {
  if (store === "cube") {
    const kind = r.provenance_kind ? String(r.provenance_kind) : "";
    const ref = r.provenance_ref ? String(r.provenance_ref) : "";
    const note = r.provenance_note ? String(r.provenance_note) : "";
    const head = [kind, ref].filter(Boolean).join(":");
    const out = [head, note].filter(Boolean).join(" — ");
    return out || undefined;
  }
  return r.evidence_source ? String(r.evidence_source) : undefined;
}

export function docIsSettled(store: LawDogStore, r: Row): boolean {
  if (store === "cube") {
    return CUBE_SETTLED_DOC_STATUSES.includes(
      String(r.status ?? "").toLowerCase() as (typeof CUBE_SETTLED_DOC_STATUSES)[number]
    );
  }
  return r.completeness === "complete_attested";
}

export class LawDogProvider implements DataProvider {
  private cfg: LawDogConfig;
  private tl: Row[] | null = null;

  constructor(cfg: LawDogConfig) {
    this.cfg = cfg;
  }

  /** Table naming differs between the two stores. */
  private t(logical: string): string {
    return this.cfg.store === "cube" ? `ld_${logical}` : logical;
  }

  get store(): LawDogStore {
    return this.cfg.store;
  }

  /** The ld_* panel tables exist on the cube store and nowhere else. */
  isCubeStore(): boolean {
    return this.cfg.store === "cube";
  }

  private async q<T>(table: string, params: string): Promise<T[]> {
    const token = await getAccessToken();
    const headers: Record<string, string> = {
      apikey: this.cfg.anonKey,
      Authorization: `Bearer ${token ?? this.cfg.anonKey}`,
    };
    // The legal schema is exposed as a PostgREST profile.
    if (this.cfg.store === "cube") {
      headers["Accept-Profile"] = "legal";
    }
    const res = await fetch(`${this.cfg.url}/rest/v1/${table}?${params}`, { headers });
    if (!res.ok) {
      throw new Error(`LawDog ${table} ${res.status}: ${await res.text()}`);
    }
    return res.json();
  }

  private caseFilter(): string {
    return this.cfg.caseId ? `&case_id=eq.${this.cfg.caseId}` : "";
  }

  // ---- DataProvider ---------------------------------------------------------

  /** Entity = Matter. */
  async listEntities(): Promise<Entity[]> {
    const clip = (s: unknown, n: number) => {
      const t = String(s ?? "").trim();
      return t.length > n ? t.slice(0, n).trimEnd() + "…" : t;
    };

    const rows = await this.q<Row>(this.t("cases"), "select=*&order=created_at.desc");
    return rows.map((r) => ({
      id: rowCaseId(this.cfg.store, r),
      name: String(r.case_name ?? "Untitled matter"),
      subtitle: clip(
        [r.case_number, String(r.court ?? "").split(" — ")[0]]
          .filter(Boolean)
          .join(" · "),
        90
      ),
      status: clip(r.status, 24),
      tags: [r.client_name, r.opposing_party, r.attorney]
        .filter(Boolean)
        .map((v) => clip(v, 40))
        .filter((v) => v !== ""),
    }));
  }

  /** Item = Timeline event. Provenance is carried, not flattened away. */
  async listItems(entityId: string): Promise<Item[]> {
    const rows = await this.q<Row>(
      this.t("timeline_events"),
      `select=*&case_id=eq.${entityId}&order=event_date.asc`
    );
    return rows.map((r) => ({
      id: String(r.id),
      entityId,
      title: String(r.event_type ?? "").slice(0, 160),
      date: String(r.event_date ?? ""),
      status: String(r.phase ?? ""),
      type: rowActor(this.cfg.store, r),
      summary: String(r.description ?? ""),
      // additive, optional on the extended Item type
      evidenceSource: rowProvenance(this.cfg.store, r),
      statute: r.statute ? String(r.statute) : undefined, // public-only column; absent on cube
    })) as Item[];
  }

  async listDocuments(): Promise<Document[]> {
    const rows = await this.q<Row>(
      this.t("documents"),
      `select=*${this.caseFilter()}&order=created_at.desc`
    );
    return rows.map((r) => this.toDoc(r));
  }

  async getDocument(docId: string): Promise<Document | null> {
    const rows = await this.q<Row>(this.t("documents"), `select=*&id=eq.${docId}&limit=1`);
    return rows.length ? this.toDoc(rows[0]) : null;
  }

  private toDoc(r: Row): Document {
    const sections: DocSection[] = [];
    if (r.description) {
      sections.push({ id: "description", title: "Description", content: String(r.description) });
    }
    const lines: (string | null)[] =
      this.cfg.store === "cube"
        ? [
            // legal.ld_documents has no completeness/attestation columns — its
            // evidentiary posture is carried by status/version/assignee.
            `Status: ${r.status ?? "unknown"}`,
            r.version ? `Version: ${r.version}` : null,
            r.assignee ? `Assignee: ${r.assignee}` : null,
            r.storage_path ? `Path: ${r.storage_path}` : null,
            r.external_url ? `External: ${r.external_url}` : null,
            r.statute ? `Statute: ${r.statute}` : null,
          ]
        : [
            // Completeness is a first-class evidentiary fact in the dave-legal file.
            `Completeness: ${r.completeness ?? "unknown"}`,
            r.completeness_basis ? `Basis: ${r.completeness_basis}` : null,
            r.completeness_attested_at ? `Attested: ${r.completeness_attested_at}` : null,
            r.source ? `Source: ${r.source}` : null,
            r.storage_path ? `Path: ${r.storage_path}` : null,
            r.statute ? `Statute: ${r.statute}` : null,
          ];
    sections.push({
      id: "provenance",
      title: "Provenance",
      content: lines.filter(Boolean).join("\n"),
    });
    return {
      id: String(r.id),
      title: String(r.filename ?? "(unnamed)"),
      type: "markdown",
      sections,
      createdAt: String(r.created_at ?? ""),
      category: String(r.category ?? "uncategorised"),
      // Each store keeps its evidentiary posture in a different column; the
      // evidence view wants one field. cube has status, dave-legal has completeness.
      status:
        (this.cfg.store === "cube" ? str(r.status) : str(r.completeness)) ?? undefined,
    };
  }

  /** Stage = phase posture, derived from task phases. No stages table exists. */
  async getStages(entityId: string): Promise<Stage[]> {
    const rows = await this.q<Row>(this.t("tasks"), `select=phase,status&case_id=eq.${entityId}`);
    const byPhase = new Map<string, { total: number; done: number }>();
    for (const r of rows) {
      const p = String(r.phase ?? "unphased");
      const acc = byPhase.get(p) ?? { total: 0, done: 0 };
      acc.total += 1;
      if (CLOSED_TASK_STATUSES.includes(String(r.status ?? "").toLowerCase() as (typeof CLOSED_TASK_STATUSES)[number]))
        acc.done += 1;
      byPhase.set(p, acc);
    }
    return [...byPhase.entries()].map(([name, a]) => ({
      id: name,
      name,
      state: a.done === a.total ? "done" : a.done > 0 ? "current" : "pending",
      detail: `${a.done}/${a.total} closed`,
    }));
  }

  async getMetrics(entityId: string): Promise<Metric[]> {
    const docSelect =
      this.cfg.store === "cube" ? "select=id,status" : "select=id,completeness";
    const [docs, tl, grounds, tasks] = await Promise.all([
      this.q<Row>(this.t("documents"), `${docSelect}&case_id=eq.${entityId}`),
      this.q<Row>(this.t("timeline_events"), `select=id&case_id=eq.${entityId}`),
      this.q<Row>(this.t("fault_grounds"), `select=id,evidence_strength&case_id=eq.${entityId}`),
      this.q<Row>(this.t("tasks"), `select=id,status&case_id=eq.${entityId}`),
    ]);
    const settled = docs.filter((d) => docIsSettled(this.cfg.store, d)).length;
    const settledLabel = this.cfg.store === "cube" ? "settled" : "attested";
    const open = tasks.filter(
      (t) => !CLOSED_TASK_STATUSES.includes(String(t.status ?? "").toLowerCase() as (typeof CLOSED_TASK_STATUSES)[number])
    ).length;
    const strongest = grounds.reduce((m, g) => Math.max(m, Number(g.evidence_strength ?? 0)), 0);
    return [
      { id: "docs", label: "Documents", value: String(docs.length), delta: `${settled} ${settledLabel}`, deltaDirection: settled / Math.max(docs.length, 1) > 0.5 ? "up" : "down" },
      { id: "timeline", label: "Timeline rows", value: String(tl.length) },
      { id: "grounds", label: "Fault grounds", value: String(grounds.length), delta: `top ${strongest.toFixed(1)}`, deltaDirection: "neutral" },
      { id: "tasks", label: "Open tasks", value: String(open), deltaDirection: open > 50 ? "down" : "neutral" },
    ];
  }

  // ---- legal-schema panel fetchers ------------------------------------------
  //
  // Every one of these is cube-only and returns [] on the case store, which has
  // no ld_* tables. Callers still guard, but a fetcher must not be the thing that
  // throws a 404 into a panel.

  async listParties(entityId: string): Promise<LdParty[]> {
    if (!this.isCubeStore()) return [];
    const rows = await this.q<Row>(
      "ld_parties",
      `select=*&case_id=eq.${entityId}&order=sort_order.asc.nullslast,name.asc`
    );
    return sortParties(rows.map(mapPartyRow));
  }

  /** Tenant-level: ld_rate_card has NO case_id. Row security scopes the read to
   *  the signed-in tenant — adding a case filter here would 400, not narrow. */
  async listRateCard(): Promise<LdRate[]> {
    if (!this.isCubeStore()) return [];
    const rows = await this.q<Row>("ld_rate_card", "select=*&order=role.asc");
    return rows.map(mapRateRow);
  }

  async listSavings(entityId: string): Promise<LdSaving[]> {
    if (!this.isCubeStore()) return [];
    const rows = await this.q<Row>(
      "ld_savings_ledger",
      `select=*&case_id=eq.${entityId}&order=occurred_at.desc.nullslast`
    );
    return rows.map(mapSavingRow);
  }

  async listSubpoenas(entityId: string): Promise<LdSubpoena[]> {
    if (!this.isCubeStore()) return [];
    const rows = await this.q<Row>(
      "ld_subpoenas",
      `select=*&case_id=eq.${entityId}&order=subpoena_no.asc.nullslast`
    );
    return rows.map(mapSubpoenaRow);
  }

  /**
   * Claim math is keyed on claim_id, not case_id — there is no case column to
   * filter on, so this reads tenant-wide (row security scopes it) and groups by
   * claim. Narrowing to the selected matter needs a claim→case join, which lands
   * when ld_claims is wired; until then the panel says what it is showing.
   */
  async listClaimMath(): Promise<LdClaimGroup[]> {
    if (!this.isCubeStore()) return [];
    const rows = await this.q<Row>(
      "ld_claim_math",
      "select=*&order=claim_id.asc.nullslast,created_at.desc"
    );
    return groupClaimMath(rows.map(mapClaimMathRow));
  }

  /** Newest calculation first; the panel headlines rows[0]. */
  async listRecoveryMath(entityId: string): Promise<LdRecoveryMath[]> {
    if (!this.isCubeStore()) return [];
    const rows = await this.q<Row>(
      "ld_recovery_math",
      `select=*&case_id=eq.${entityId}&order=last_calculated.desc.nullslast`
    );
    return rows.map(mapRecoveryMathRow);
  }

  // ---- Coverage screen ------------------------------------------------------

  /**
   * THE LOOP — has every piece of evidence been examined every way.
   *
   * HONEST LIMIT, and it is surfaced in the UI: with no link table, "examined"
   * can only be estimated by asking whether a document's 8-character ID appears
   * anywhere in the timeline corpus. That OVER-COUNTS gaps, because a document
   * analysed but cited by filename or thread ID reads as uncited.
   *
   * This is a SCREEN, not a verdict. Every hit needs eyes before it is called a gap.
   * The real fix is a link table (ld_evidence_links); until that exists, this is
   * the most honest measure available and it must be labelled as such.
   */
  async getCoverage(entityId: string): Promise<CoverageCell[]> {
    const cube = this.cfg.store === "cube";
    if (!this.tl) {
      this.tl = await this.q<Row>(
        this.t("timeline_events"),
        cube
          ? `select=description,provenance_ref,provenance_kind,provenance_note,event_type&case_id=eq.${entityId}`
          : `select=description,evidence_source,event_type&case_id=eq.${entityId}`
      );
    }
    const blob = this.tl
      .map((r) =>
        cube
          ? `${r.description ?? ""} ${r.provenance_ref ?? ""} ${r.provenance_kind ?? ""} ${r.provenance_note ?? ""} ${r.event_type ?? ""}`
          : `${r.description ?? ""} ${r.evidence_source ?? ""} ${r.event_type ?? ""}`
      )
      .join(" ");

    const docs = await this.q<Row>(
      this.t("documents"),
      cube
        ? `select=id,filename,category,status&case_id=eq.${entityId}`
        : `select=id,filename,category,completeness&case_id=eq.${entityId}`
    );

    return docs.map((d) => {
      const key = String(d.id).slice(0, 8);
      const cited = blob.includes(key) || (d.filename ? blob.includes(String(d.filename)) : false);
      const domains = {} as Record<CoverageDomain, boolean>;
      for (const dom of DOMAINS) {
        // Until ld_evidence_links exists there is no per-domain signal.
        // Authenticity is the one independently knowable column: attestation on
        // the dave-legal store, settled status (weaker, labelled) on the cube.
        domains[dom] =
          dom === "authenticity_and_metadata" ? docIsSettled(this.cfg.store, d) : cited;
      }
      return {
        docId: String(d.id),
        docKey: key,
        filename: String(d.filename ?? "(unnamed)"),
        category: (d.category as string | null) ?? null,
        completeness: (cube ? (d.status as string | null) : (d.completeness as string | null)) ?? null,
        citedById: cited,
        domains: domains,
      };
    });
  }
}

export { DOMAINS };
