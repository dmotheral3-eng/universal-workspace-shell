/**
 * Fixture rows for the six legal data panels.
 *
 * These are RAW rows — snake_case, shaped exactly like the live column lists read
 * from the legal schema on 2026-08-09 — and they are fed through the same row
 * mappers the provider uses. That is the point: the harness exercises the column
 * map, not a hand-tidied version of it.
 *
 * Dev and preview render EMPTY, by design: anon has no grant on these tables and
 * there is no anonymous read path. Fixtures are how the populated states get
 * looked at without a session, and are the only sanctioned way to do it — nobody
 * "fixes" an empty panel by touching config, auth or the database.
 *
 * Deliberately included, because these are the shapes that break panels:
 *   · an unknown priority and an unknown status (neutral pill, no white screen)
 *   · null numerics, null dates, missing counsel
 *   · array-shaped jsonb AND object-shaped jsonb (itemized vs raw-pretty)
 */

type Row = Record<string, unknown>;

const CASE_ID = "ce111111-0000-4000-8000-00000000ce11";
const TENANT_ID = "10000000-0000-4000-8000-000000000001";

export const partyRows: Row[] = [
  {
    id: "p1",
    tenant_id: TENANT_ID,
    case_id: CASE_ID,
    role: "plaintiff",
    name: "Marisol Reyes",
    entity_type: "individual",
    counsel_name: "H. Okonkwo",
    counsel_bar_no: "TX 24099120",
    counsel_email: "okonkwo@example.test",
    is_client: true,
    notes: "Primary claimant; deposition scheduled.",
    sort_order: 1,
    created_at: "2026-03-02T14:10:00Z",
  },
  {
    id: "p2",
    tenant_id: TENANT_ID,
    case_id: CASE_ID,
    role: "defendant",
    name: "Northgate Logistics LLC",
    entity_type: "corporation",
    counsel_name: "D. Whitfield",
    counsel_bar_no: null,
    counsel_email: "dwhitfield@example.test",
    is_client: false,
    notes: null,
    sort_order: 2,
    created_at: "2026-03-02T14:12:00Z",
  },
  {
    id: "p3",
    tenant_id: TENANT_ID,
    case_id: CASE_ID,
    role: "defendant",
    name: "Ellis Byrne",
    entity_type: "individual",
    counsel_name: null,
    counsel_bar_no: null,
    counsel_email: null,
    is_client: false,
    notes: "Driver of record.",
    sort_order: null,
    created_at: "2026-03-04T09:00:00Z",
  },
  {
    id: "p4",
    tenant_id: TENANT_ID,
    case_id: CASE_ID,
    role: "third_party_witness",
    name: "Ada Fenwick",
    entity_type: null,
    counsel_name: null,
    counsel_bar_no: null,
    counsel_email: null,
    is_client: false,
    notes: null,
    sort_order: 5,
    created_at: "2026-03-10T11:30:00Z",
  },
];

export const rateRows: Row[] = [
  {
    id: "r1",
    tenant_id: TENANT_ID,
    role: "partner",
    hourly_rate: 625,
    locale: "TX",
    basis: "standard",
    created_at: "2026-01-04T00:00:00Z",
  },
  {
    id: "r2",
    tenant_id: TENANT_ID,
    role: "associate",
    hourly_rate: "385.50",
    locale: "TX",
    basis: "standard",
    created_at: "2026-01-04T00:00:00Z",
  },
  {
    id: "r3",
    tenant_id: TENANT_ID,
    role: "paralegal",
    hourly_rate: 165,
    locale: null,
    basis: "blended_2026",
    created_at: "2026-01-04T00:00:00Z",
  },
];

export const savingsRows: Row[] = [
  {
    id: "s1",
    tenant_id: TENANT_ID,
    case_id: CASE_ID,
    action_key: "chronology_build",
    action_label: "Chronology assembled from source records",
    hours_displaced: 11.5,
    rate_used: 385.5,
    dollars_saved: 4433.25,
    estimate_basis: null,
    is_estimate: false,
    occurred_at: "2026-05-18T16:40:00Z",
    session_ref: "sess-4471",
    created_at: "2026-05-18T16:41:00Z",
  },
  {
    id: "s2",
    tenant_id: TENANT_ID,
    case_id: CASE_ID,
    action_key: "privilege_screen",
    action_label: "Privilege screen over production set",
    hours_displaced: 6,
    rate_used: 165,
    dollars_saved: 990,
    estimate_basis: "Comparable manual screen, 250 docs/hour",
    is_estimate: true,
    occurred_at: "2026-06-02T10:05:00Z",
    session_ref: null,
    created_at: "2026-06-02T10:06:00Z",
  },
  {
    id: "s3",
    tenant_id: TENANT_ID,
    case_id: CASE_ID,
    action_key: "damages_recompute",
    action_label: null,
    hours_displaced: null,
    rate_used: null,
    dollars_saved: 1200,
    estimate_basis: "Flat credit agreed at intake",
    is_estimate: true,
    occurred_at: null,
    session_ref: null,
    created_at: "2026-06-11T08:00:00Z",
  },
];

export const subpoenaRows: Row[] = [
  {
    id: "sp1",
    tenant_id: TENANT_ID,
    case_id: CASE_ID,
    subpoena_no: 1,
    target: "Northgate Logistics LLC",
    target_type: "corporate_records",
    what_it_gets: "Dispatch logs, telematics exports and driver hours for the 90 days before the incident.",
    what_it_proves: "Whether the operator exceeded permitted hours and whether dispatch knew.",
    legal_impact: "Supports the negligent-supervision ground independent of the driver's own conduct.",
    jurisdiction: "N.D. Tex.",
    priority: "high",
    filing_day: "Day 14",
    est_cost_low: 450,
    est_cost_high: 1200,
    status: "served",
    filed_date: "2026-04-08",
    response_date: "2026-05-01",
  },
  {
    id: "sp2",
    tenant_id: TENANT_ID,
    case_id: CASE_ID,
    subpoena_no: 2,
    target: "Cedar Ridge Imaging",
    target_type: "medical_provider",
    what_it_gets: "Complete imaging series and radiologist notes.",
    what_it_proves: "Injury existed before the disputed second collision.",
    legal_impact: null,
    jurisdiction: "N.D. Tex.",
    priority: "medium",
    filing_day: null,
    est_cost_low: 150,
    est_cost_high: null,
    status: "pending",
    filed_date: null,
    response_date: null,
  },
  {
    // Unknown priority AND unknown status: both must fall back to a neutral pill.
    id: "sp3",
    tenant_id: TENANT_ID,
    case_id: CASE_ID,
    subpoena_no: 3,
    target: "Statewide Toll Authority",
    target_type: null,
    what_it_gets: "Gantry photographs for the corridor on the incident date.",
    what_it_proves: null,
    legal_impact: null,
    jurisdiction: null,
    priority: "expedited_special",
    filing_day: null,
    est_cost_low: null,
    est_cost_high: null,
    status: "escalated_to_court",
    filed_date: null,
    response_date: null,
  },
];

export const claimMathRows: Row[] = [
  {
    id: "cm1",
    tenant_id: TENANT_ID,
    claim_id: "claim-negligence-01",
    amount_target: 480000,
    amount_low: 310000,
    amount_high: 725000,
    line_items: [
      { label: "Past medical", amount: 128400 },
      { label: "Future care", amount: 214000 },
      { label: "Lost earnings", amount: 96500 },
      { label: "Property", amount: 41100 },
    ],
    methodology: "Life-care plan plus wage table; future care discounted at 3%.",
    created_at: "2026-06-20T12:00:00Z",
  },
  {
    id: "cm0",
    tenant_id: TENANT_ID,
    claim_id: "claim-negligence-01",
    amount_target: 455000,
    amount_low: 300000,
    amount_high: 700000,
    line_items: [{ label: "Past medical", amount: 121000 }],
    methodology: "Superseded intake pass.",
    created_at: "2026-04-01T12:00:00Z",
  },
  {
    // Object-shaped jsonb — must render raw-pretty rather than as a list.
    id: "cm2",
    tenant_id: TENANT_ID,
    claim_id: "claim-supervision-02",
    amount_target: null,
    amount_low: 60000,
    amount_high: 190000,
    line_items: { basis: "policy limits", carrier_positions: { primary: 100000, excess: 90000 } },
    methodology: null,
    created_at: "2026-06-21T09:30:00Z",
  },
];

export const recoveryMathRows: Row[] = [
  {
    id: "rm1",
    tenant_id: TENANT_ID,
    case_id: CASE_ID,
    combined_low: 370000,
    combined_mid: 615000,
    combined_high: 915000,
    breakdown: [
      { label: "Negligence claim", amount: 480000 },
      { label: "Negligent supervision", amount: 95000 },
      { label: "Statutory interest", amount: 40000 },
    ],
    methodology: "Sum of claim targets, weighted by liability confidence.",
    last_calculated: "2026-07-30T18:22:00Z",
    created_at: "2026-07-30T18:22:00Z",
  },
  {
    id: "rm0",
    tenant_id: TENANT_ID,
    case_id: CASE_ID,
    combined_low: 340000,
    combined_mid: 560000,
    combined_high: 880000,
    breakdown: null,
    methodology: null,
    last_calculated: "2026-05-02T09:00:00Z",
    created_at: "2026-05-02T09:00:00Z",
  },
];
