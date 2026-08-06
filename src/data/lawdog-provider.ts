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
 *             This is where Kelly v. Motheral actually lives today.
 *   "cube"  → iofslupbvedjzmfmkdvx, schema legal (PostgREST profile "legal").
 *             23 ld_* tables, tenant-scoped, FORCE RLS. The product store.
 *
 * Which one a given deployment points at is a CONFIG choice, not a code choice —
 * that is the whole point of the swappable data layer. Kelly's placement is an
 * open ruling; this adapter does not decide it.
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

export interface CoverageCell {
  docId: string;
  docKey: string;      // 8-char prefix, the citation form used across the file
  filename: string;
  category: string | null;
  completeness: string | null;
  citedById: boolean;  // ID appears somewhere in the timeline corpus
  domains: Record<CoverageDomain, boolean>;
}

export class LawDogProvider implements DataProvider {
  private cfg: LawDogConfig;
  private tl: Record<string, unknown>[] | null = null;

  constructor(cfg: LawDogConfig) {
    this.cfg = cfg;
  }

  /** Table naming differs between the two stores. */
  private t(logical: string): string {
    return this.cfg.store === "cube" ? `ld_${logical}` : logical;
  }

  private async q<T>(table: string, params: string): Promise<T[]> {
    const token = await getAccessToken();
    const headers: Record<string, string> = {
      apikey: this.cfg.anonKey,
      Authorization: `Bearer ${token ?? this.cfg.anonKey}`,
    };
    // The Cube exposes schema `legal` as a PostgREST profile.
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

    const rows = await this.q<Record<string, string | number | null>>(
      this.t("cases"),
      "select=*&order=created_at.desc"
    );
    return rows.map((r) => ({
      id: String(r.id),
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
    const rows = await this.q<Record<string, string | null>>(
      this.t("timeline_events"),
      `select=*&case_id=eq.${entityId}&order=event_date.asc`
    );
    return rows.map((r) => ({
      id: String(r.id),
      entityId,
      title: String(r.event_type ?? "").slice(0, 160),
      date: String(r.event_date ?? ""),
      status: String(r.phase ?? ""),
      type: String(r.who ?? ""),
      summary: String(r.description ?? ""),
      // additive, optional on the extended Item type — see lawdog-types.ts
      evidenceSource: r.evidence_source ?? undefined,
      statute: r.statute ?? undefined,
    })) as Item[];
  }

  async listDocuments(): Promise<Document[]> {
    const rows = await this.q<Record<string, string | null>>(
      this.t("documents"),
      `select=*${this.caseFilter()}&order=created_at.desc`
    );
    return rows.map((r) => this.toDoc(r));
  }

  async getDocument(docId: string): Promise<Document | null> {
    const rows = await this.q<Record<string, string | null>>(
      this.t("documents"),
      `select=*&id=eq.${docId}&limit=1`
    );
    return rows.length ? this.toDoc(rows[0]) : null;
  }

  private toDoc(r: Record<string, string | null>): Document {
    const sections: DocSection[] = [];
    if (r.description) {
      sections.push({ id: "description", title: "Description", content: r.description });
    }
    // Completeness is a first-class evidentiary fact in this file, not metadata.
    sections.push({
      id: "provenance",
      title: "Provenance",
      content: [
        `Completeness: ${r.completeness ?? "unknown"}`,
        r.completeness_basis ? `Basis: ${r.completeness_basis}` : null,
        r.completeness_attested_at ? `Attested: ${r.completeness_attested_at}` : null,
        r.source ? `Source: ${r.source}` : null,
        r.storage_path ? `Path: ${r.storage_path}` : null,
        r.statute ? `Statute: ${r.statute}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
    });
    return {
      id: String(r.id),
      title: String(r.filename ?? "(unnamed)"),
      type: "markdown",
      sections,
      createdAt: String(r.created_at ?? ""),
      category: String(r.category ?? "uncategorised"),
    };
  }

  /** Stage = phase posture, derived from task phases. No stages table exists. */
  async getStages(entityId: string): Promise<Stage[]> {
    const rows = await this.q<Record<string, string | null>>(
      this.t("tasks"),
      `select=phase,status&case_id=eq.${entityId}`
    );
    const byPhase = new Map<string, { total: number; done: number }>();
    for (const r of rows) {
      const p = r.phase ?? "unphased";
      const acc = byPhase.get(p) ?? { total: 0, done: 0 };
      acc.total += 1;
      if ((r.status ?? "").toLowerCase() === "complete") acc.done += 1;
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
    const [docs, tl, grounds, tasks] = await Promise.all([
      this.q<Record<string, string>>(this.t("documents"), `select=id,completeness&case_id=eq.${entityId}`),
      this.q<Record<string, string>>(this.t("timeline_events"), `select=id&case_id=eq.${entityId}`),
      this.q<Record<string, number>>(this.t("fault_grounds"), `select=id,evidence_strength&case_id=eq.${entityId}`),
      this.q<Record<string, string>>(this.t("tasks"), `select=id,status&case_id=eq.${entityId}`),
    ]);
    const attested = docs.filter((d) => d.completeness === "complete_attested").length;
    const open = tasks.filter((t) => (t.status ?? "").toLowerCase() !== "complete").length;
    const strongest = grounds.reduce((m, g) => Math.max(m, Number(g.evidence_strength ?? 0)), 0);
    return [
      { id: "docs", label: "Documents", value: String(docs.length), delta: `${attested} attested`, deltaDirection: attested / Math.max(docs.length, 1) > 0.5 ? "up" : "down" },
      { id: "timeline", label: "Timeline rows", value: String(tl.length) },
      { id: "grounds", label: "Fault grounds", value: String(grounds.length), delta: `top ${strongest.toFixed(1)}`, deltaDirection: "neutral" },
      { id: "tasks", label: "Open tasks", value: String(open), deltaDirection: open > 50 ? "down" : "neutral" },
    ];
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
    if (!this.tl) {
      this.tl = await this.q<Record<string, unknown>>(
        this.t("timeline_events"),
        `select=description,evidence_source,event_type&case_id=eq.${entityId}`
      );
    }
    const blob = this.tl
      .map((r) => `${r.description ?? ""} ${r.evidence_source ?? ""} ${r.event_type ?? ""}`)
      .join(" ");

    const docs = await this.q<Record<string, string | null>>(
      this.t("documents"),
      `select=id,filename,category,completeness&case_id=eq.${entityId}`
    );

    return docs.map((d) => {
      const key = String(d.id).slice(0, 8);
      const cited = blob.includes(key);
      const domains = {} as Record<CoverageDomain, boolean>;
      for (const dom of DOMAINS) {
        // Until ld_evidence_links exists there is no per-domain signal.
        // Only authenticity is independently knowable, from completeness.
        domains[dom] =
          dom === "authenticity_and_metadata"
            ? d.completeness === "complete_attested"
            : cited;
      }
      return {
        docId: String(d.id),
        docKey: key,
        filename: String(d.filename ?? "(unnamed)"),
        category: d.category,
        completeness: d.completeness,
        citedById: cited,
        domains,
      };
    });
  }
}

export { DOMAINS };
