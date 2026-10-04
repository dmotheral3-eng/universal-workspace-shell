/**
 * The three gate rows, as `public.bw_v_gate_rules` returns them (BOR-132).
 * Test fixture only — the words here are copied from the ruling so a test can
 * assert that what the broker returns is what the ROW said, not something the
 * broker composed. Production reads the rows; nothing imports this at runtime.
 */
export interface GateRow {
  tenant_id: string;
  rule_key: string;
  version: number;
  label: string;
  description: string;
  owner_role: string;
  condition: Record<string, unknown>;
}

export function gateRows(tenantId: string): GateRow[] {
  return [
    {
      tenant_id: tenantId,
      rule_key: "bw-gate-step-sealed",
      version: 1,
      label: "This step is sealed.",
      description:
        "A sealed checklist step is part of the record and cannot be changed. To correct it, add a new step that supersedes it; the original stays.",
      owner_role: "compliance",
      condition: { kind: "sealed", source: "vendor_facts.value.sealed" },
    },
    {
      tenant_id: tenantId,
      rule_key: "bw-gate-vendor-step-write",
      version: 1,
      label: "Vendor-risk role required.",
      description:
        "Only a member holding the vendor-risk role can change a vendor checklist step. Ask your administrator for the role; the attempt has been recorded.",
      owner_role: "vendor-risk",
      condition: { kind: "role", role: "vendor-risk" },
    },
    {
      tenant_id: tenantId,
      rule_key: "bw-gate-flagged-decision-signoff",
      version: 1,
      label: "Risk sign-off required on a flagged decision.",
      description:
        "This decision is flagged for fair-lending review. Only a member holding the Risk role can sign it off. The attempt has been recorded.",
      owner_role: "Risk",
      condition: { kind: "role_and_flag", role: "Risk", flag: "flagged" },
    },
  ];
}

/** Answer a PostgREST read of the gate view: tenant and `rule_key=in.(…)` applied. */
export function answerGateRead(url: string, rows: GateRow[]): Response {
  const q = new URL(url).searchParams;
  const tenant = (q.get("tenant_id") ?? "").replace(/^eq\./, "");
  const keys = (q.get("rule_key") ?? "").replace(/^in\.\(/, "").replace(/\)$/, "").split(",");
  return new Response(JSON.stringify(rows.filter((r) => r.tenant_id === tenant && keys.includes(r.rule_key))), {
    status: 200,
  });
}
