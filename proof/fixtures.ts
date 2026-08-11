import type { Document, Entity, Item, Metric, Stage } from "../src/data/types";

/**
 * Fixtures for the D-LDUX-2 before/after proof shots.
 *
 * These are SHAPED like the live legal rows and run through the same panels, but
 * they are invented — no client, matter or party here is real. They exist because
 * the live states cannot be photographed: every legal.ld_* table is RLS-scoped to
 * an authenticated tenant and returns zero rows to an anonymous build BY DESIGN
 * (see the auth note at the top of src/data/lawdog-provider.ts). Fixtures are the
 * sanctioned way to inspect a populated panel — the same reasoning that put
 * src/panels-preview.tsx in the tree.
 */

export const matters: Entity[] = [
  {
    id: "m1",
    name: "Whitmore v. Ardsley Holdings",
    subtitle: "24-CV-0918 · Superior Court, Dallas County",
    status: "active",
    tags: ["Whitmore, R.", "Ardsley Holdings LLC", "Pruitt"],
  },
  {
    id: "m2",
    name: "Estate of Calloway",
    subtitle: "24-PR-2214 · Probate Court No. 2",
    status: "pending",
    tags: ["Calloway, D.", "First Meridian Bank"],
  },
  {
    id: "m3",
    name: "Nakamura Custody Modification",
    subtitle: "23-FM-7781 · 301st Family District",
    status: "active",
    tags: ["Nakamura, S.", "Nakamura, T.", "Ortega"],
  },
  {
    id: "m4",
    name: "Brightline Freight — Contract Dispute",
    subtitle: "24-CV-3302 · Northern District",
    status: "filed",
    tags: ["Brightline Freight Inc.", "Vasquez Logistics"],
  },
  {
    id: "m5",
    name: "Delacroix Trust Accounting",
    subtitle: "22-PR-0455 · Probate Court No. 1",
    status: "closed",
    tags: ["Delacroix Family Trust"],
  },
  {
    id: "m6",
    name: "Okoye v. Sterling Medical Group",
    subtitle: "24-CV-1187 · Superior Court, Travis County",
    status: "flagged",
    tags: ["Okoye, A.", "Sterling Medical Group", "Hensley"],
  },
];

export const timeline: Item[] = [
  { id: "t1", entityId: "m1", title: "Original petition filed", date: "2024-03-11", status: "complete", type: "R. Whitmore", summary: "Petition filed alleging breach of the 2022 supply agreement and seeking specific performance plus consequential damages.", evidenceSource: "filing:24-CV-0918-001" },
  { id: "t2", entityId: "m1", title: "Answer and counterclaim served", date: "2024-04-02", status: "complete", type: "Ardsley Holdings LLC", summary: "Defendant answered with a general denial and counterclaimed for unpaid invoices totalling $212,400.", evidenceSource: "filing:24-CV-0918-014" },
  { id: "t3", entityId: "m1", title: "First request for production", date: "2024-05-20", status: "served", type: "R. Whitmore", summary: "Forty-one requests directed at the supply agreement negotiation, delivery records and internal pricing memoranda.", evidenceSource: "discovery:RFP-1" },
  { id: "t4", entityId: "m1", title: "Production received — partial", date: "2024-06-28", status: "in_progress", type: "Ardsley Holdings LLC", summary: "1,180 pages produced. Twelve requests answered with objections; nothing produced on internal pricing.", evidenceSource: "discovery:PROD-1180" },
  { id: "t5", entityId: "m1", title: "Deposition of C. Pruitt noticed", date: "2024-07-15", status: "pending", type: "R. Whitmore", summary: "Corporate representative deposition noticed for the pricing and delivery topics left unanswered in production.", evidenceSource: "discovery:DEPO-NOTICE-3" },
  { id: "t6", entityId: "m1", title: "Motion to compel filed", date: "2024-08-04", status: "filed", type: "R. Whitmore", summary: "Motion to compel the withheld pricing memoranda; hearing requested on the next available docket.", evidenceSource: "filing:24-CV-0918-061" },
  { id: "t7", entityId: "m1", title: "Objection to motion to compel", date: "2024-08-19", status: "objected", type: "Ardsley Holdings LLC", summary: "Opposition asserts trade secret protection over the pricing memoranda and proposes an attorneys-eyes-only order.", evidenceSource: "filing:24-CV-0918-068" },
];

export const documents: Document[] = [
  { id: "d1", title: "Supply Agreement — executed 2022-04-08", type: "structured", category: "Agreements", createdAt: "2024-03-11", status: "reviewed", sections: [{ id: "s1", title: "Term and termination", content: "The agreement runs three years from execution and renews annually unless either party gives ninety days written notice." }, { id: "s2", title: "Pricing", content: "Unit pricing is fixed for the first twelve months and thereafter adjusts by the published index, capped at four percent per year." }] },
  { id: "d2", title: "Invoice ledger 2023–2024", type: "structured", category: "Financial", createdAt: "2024-04-02", status: "reviewed", sections: [{ id: "s3", title: "Summary", content: "Fifty-one invoices, $1,904,220 billed, $212,400 outstanding across the final four invoices." }] },
  { id: "d3", title: "Email thread — pricing escalation", type: "markdown", category: "Correspondence", createdAt: "2024-06-28", status: "pending", sections: [{ id: "s4", title: "Thread", content: "Nine messages between March and May 2023 discussing an off-schedule price increase. Two attachments referenced but not produced." }] },
  { id: "d4", title: "Delivery logs — Q3 2023", type: "structured", category: "Records", createdAt: "2024-06-28", status: "pending", sections: [{ id: "s5", title: "Coverage", content: "Daily delivery records, 1 July to 30 September 2023. Eleven days missing without explanation." }] },
  { id: "d5", title: "Internal pricing memorandum (withheld)", type: "markdown", category: "Records", createdAt: "2024-08-19", status: "flagged", sections: [{ id: "s6", title: "Status", content: "Identified on the privilege log as trade secret. Not produced. Subject of the pending motion to compel." }] },
  { id: "d6", title: "Photograph — loading dock 2023-08-14", type: "markdown", category: "Records", createdAt: "2024-06-28", status: "reviewed", sections: [{ id: "s7", title: "Description", content: "Dock photograph timestamped 08:41, showing pallet counts inconsistent with the delivery log for that date." }] },
  { id: "d7", title: "Motion to compel production", type: "structured", category: "Court filings", createdAt: "2024-08-04", status: "filed", sections: [{ id: "s8", title: "Relief requested", content: "An order compelling production of the pricing memoranda, or in camera review, and costs." }] },
  { id: "d8", title: "Opposition to motion to compel", type: "structured", category: "Court filings", createdAt: "2024-08-19", status: "filed", sections: [{ id: "s9", title: "Argument", content: "Asserts trade secret protection and proposes an attorneys-eyes-only protective order as an alternative." }] },
  { id: "d9", title: "Lab analysis — material samples", type: "structured", category: "Results", createdAt: "2024-07-02", status: "pending", sections: [{ id: "s10", title: "Findings", content: "Three of eight samples fall below the tensile specification stated in the agreement." }] },
  { id: "d10", title: "Expert retention letter — M. Ito", type: "structured", category: "Correspondence", createdAt: "2024-07-22", status: "reviewed", sections: [{ id: "s11", title: "Scope", content: "Retained to opine on industry pricing practice and on the tensile specification." }] },
  { id: "d11", title: "Privilege log v3", type: "structured", category: "Records", createdAt: "2024-08-19", status: "flagged", sections: [{ id: "s12", title: "Entries", content: "Forty-two entries. Eleven give no author, which is the basis of the pending challenge." }] },
  { id: "d12", title: "Damages model — consequential", type: "structured", category: "Financial", createdAt: "2024-08-01", status: "pending", sections: [{ id: "s13", title: "Method", content: "Lost margin on displaced volume, cross-checked against the 2021 baseline year." }] },
];

export const stages: Stage[] = [
  { id: "st1", name: "Intake", state: "done", detail: "Engagement signed 2024-02-28" },
  { id: "st2", name: "Pleadings", state: "done", detail: "4/4 closed" },
  { id: "st3", name: "Written discovery", state: "done", detail: "9/9 closed" },
  { id: "st4", name: "Document production", state: "current", detail: "5/8 closed" },
  { id: "st5", name: "Depositions", state: "pending" },
  { id: "st6", name: "Expert reports", state: "pending" },
  { id: "st7", name: "Pre-trial", state: "pending" },
];

export const metrics: Metric[] = [
  { id: "docs", label: "Documents", value: "12", delta: "5 settled", deltaDirection: "down" },
  { id: "timeline", label: "Timeline rows", value: "7" },
  { id: "grounds", label: "Fault grounds", value: "3", delta: "top 0.8", deltaDirection: "neutral" },
  { id: "tasks", label: "Open tasks", value: "8", deltaDirection: "neutral" },
];
