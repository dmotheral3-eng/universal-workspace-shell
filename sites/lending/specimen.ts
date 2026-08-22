import type { ScanRow } from "@/bw/data"

/**
 * FICTIONAL SPECIMEN ROWS.
 *
 * Every product visual on the public page renders a real component over these.
 * No client's book, no client's agents, no client's policy — invented lenders,
 * invented agent references, invented contacts. The frame around each visual
 * says "fictional specimen" on the surface as well as here, because a marketing
 * page that shows a real book once has shown it forever.
 *
 * The ids are ordinary hex so the register's shortRef() derives a plausible
 * handle from the tail, exactly as it does on the operator desk.
 */
export const SPECIMEN_BOOK = "Bluebonnet Lending — fictional specimen"

export const SPECIMEN_ROWS: ScanRow[] = [
  {
    id: "9f2c41d8-7c6a-4b19-9d02-000000a41c07",
    bookId: "specimen",
    channel: "call",
    occurredAt: "2027-01-17T15:42:00Z",
    agentRef: "AGT-114",
    policyVersion: "collections policy v7",
    flagged: true,
    flagRule: "contact-frequency",
    disposition: "in_review",
  },
  {
    id: "1a77bc03-5d21-4f88-8b41-000000b2e93f",
    bookId: "specimen",
    channel: "call",
    occurredAt: "2027-01-18T09:05:00Z",
    agentRef: "AGT-207",
    policyVersion: "collections policy v7",
    flagged: false,
    flagRule: null,
    disposition: "closed",
  },
  {
    id: "6b4e90aa-2f13-4cc7-9a55-000000c71d84",
    bookId: "specimen",
    channel: "call",
    occurredAt: "2027-01-18T11:26:00Z",
    agentRef: "AGT-114",
    policyVersion: "collections policy v7",
    flagged: true,
    flagRule: "settlement-authority",
    disposition: "escalated",
  },
  {
    id: "0c19d7f5-8ab4-4d60-b3e2-000000d38f21",
    bookId: "specimen",
    channel: "email",
    occurredAt: "2027-01-19T08:14:00Z",
    agentRef: "AGT-330",
    policyVersion: "collections policy v7",
    flagged: true,
    flagRule: "fee-disclosure",
    disposition: "coached",
  },
  {
    id: "3d8f26b1-4e7c-49a3-8f14-000000e59a6c",
    bookId: "specimen",
    channel: "chat",
    occurredAt: "2027-01-19T13:51:00Z",
    agentRef: "AGT-052",
    policyVersion: "collections policy v7",
    flagged: false,
    flagRule: null,
    disposition: "closed",
  },
  {
    id: "8e05a3c9-6b28-4a71-bd93-000000f6b40d",
    bookId: "specimen",
    channel: "call",
    occurredAt: "2027-01-20T10:33:00Z",
    agentRef: "AGT-441",
    policyVersion: "collections policy v7",
    flagged: true,
    flagRule: "right-party-contact",
    disposition: "escalated",
  },
]

/** The rulebook, shown as chips. Policy rows, not a generic template. */
export const RULEBOOK_CHIPS = [
  "CALL-FREQ-07",
  "RIGHT-PARTY-02",
  "FEE-DISCLOSURE-04",
  "SETTLEMENT-AUTH-01",
  "PROMISSORY-LANG-03",
  "CEASE-CONTACT-06",
  "THIRD-PARTY-DISC-05",
  "RECORDING-NOTICE-09",
]

/** Jurisdictions, shown as chips. Breadth at a glance. */
export const JURISDICTION_CHIPS = [
  "TX-RL",
  "TX-CAB",
  "KS-SL",
  "NY-LL",
  "VA-BFI",
  "NM-SLC",
  "OK-DCC",
  "MO-DOF",
  "UT-DFI",
  "WI-DFI",
]
