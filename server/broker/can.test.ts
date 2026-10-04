import { describe, expect, it } from "vitest";
import { handleCubeRequest } from "./handler";
import type { BrokerEnv } from "./env";
import { answerGateRead, gateRows, type GateRow } from "./gates.fixture";
import { evaluateGates, gateForCode, reasonOf, roleHeld, roleKey, type GateRule } from "./gates";

/**
 * The `can` route (BOR-132).
 *
 * The point of these is AGREEMENT: the rule_key `can` names before the click is
 * the rule_key the write door returns after it, both read from the same rows.
 * So the last block runs both doors against one fake Cube and compares them.
 */

const CUBE_SECRET = "cube-broker-key-must-never-leak";
const ENV: BrokerEnv = {
  masterUrl: "https://master.example",
  masterAnonKey: "master-anon-key",
  cubeUrl: "https://cube.example",
  cubeKey: CUBE_SECRET,
  cubeSchema: "",
  membershipTable: "shell_tenant_members",
};

const TENANT = "6f361690-9876-43e8-b5bd-9bba6c44ae68";
const OTHER_TENANT = "3018ac90-5d2d-45b4-87b4-a34f1b66d1e8";
const PAYFLOW = "862552ac-c4a1-45ae-8a3e-068c9a9ecdda";
const RIVAL = "99999999-9999-4999-8999-999999999999";

const READ = "lending.evidence";
const ROLE = "lending.role.vendor-risk";

interface Step {
  tenant_id: string;
  vendor_id: string;
  fact_key: string;
  sealed: boolean;
}
const STEPS: Step[] = [
  { tenant_id: TENANT, vendor_id: PAYFLOW, fact_key: "subcontractor_disclosure", sealed: false },
  { tenant_id: TENANT, vendor_id: PAYFLOW, fact_key: "soc2_type_ii_report", sealed: true },
  { tenant_id: OTHER_TENANT, vendor_id: RIVAL, fact_key: "subcontractor_disclosure", sealed: false },
];

/**
 * The two members who exist on tenant borrowworks today hold exactly
 * `lending.books` and `lending.evidence` — `member` is that person. `risk` is
 * the one Dave has not granted yet.
 */
const USERS: Record<string, { id: string; tenant: string; entitlements: string[] }> = {
  "token-member": { id: "member", tenant: TENANT, entitlements: ["lending.books", READ] },
  "token-risk": { id: "risk", tenant: TENANT, entitlements: ["lending.books", READ, ROLE] },
  "token-operator": { id: "operator", tenant: TENANT, entitlements: ["*"] },
  "token-other-write": { id: "writeonly", tenant: TENANT, entitlements: [READ, "lending.vendors.write"] },
  "token-stranger": { id: "stranger", tenant: TENANT, entitlements: ["legal.rates"] },
};

interface Opts {
  gateStatus?: number;
  gateRows?: GateRow[];
}

function fakeUpstream(opts: Opts = {}) {
  const calls: string[] = [];
  const evidence: Array<{ author: string; reasoning: string; status: string }> = [];

  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push(url);
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const bearer = (headers.Authorization ?? "").replace(/^Bearer\s+/, "");
    const who = USERS[bearer];

    if (url.startsWith(`${ENV.masterUrl}/auth/v1/user`)) {
      return who
        ? new Response(JSON.stringify({ id: who.id, email: `${who.id}@example.test` }), { status: 200 })
        : new Response("{}", { status: 401 });
    }
    if (url.startsWith(`${ENV.masterUrl}/rest/v1/${ENV.membershipTable}`)) {
      return new Response(
        JSON.stringify(who ? [{ tenant_id: who.tenant, entitlements: who.entitlements, status: "active" }] : []),
        { status: 200 }
      );
    }
    if (url.startsWith(`${ENV.cubeUrl}/rest/v1/bw_v_gate_rules?`)) {
      if (opts.gateStatus) return new Response("{}", { status: opts.gateStatus });
      return answerGateRead(url, opts.gateRows ?? [...gateRows(TENANT), ...gateRows(OTHER_TENANT)]);
    }
    if (url.startsWith(`${ENV.cubeUrl}/rest/v1/bw_v_vendor_checklist?`)) {
      const q = new URL(url).searchParams;
      const eq = (k: string) => (q.get(k) ?? "").replace(/^eq\./, "");
      return new Response(
        JSON.stringify(
          STEPS.filter((s) => s.tenant_id === eq("tenant_id") && s.vendor_id === eq("vendor_id") && s.fact_key === eq("fact_key"))
        ),
        { status: 200 }
      );
    }
    if (url === `${ENV.cubeUrl}/rest/v1/rpc/fn_broker_write`) {
      // The wall in miniature: sealed, then role — keyed on what the broker sent.
      const a = JSON.parse(String(init?.body)) as {
        p_tenant: string; p_actor: string; p_entitlements: string[]; p_required: string;
        p_id: { vendor_id: string; fact_key: string };
      };
      const step = STEPS.find((s) => s.tenant_id === a.p_tenant && s.vendor_id === a.p_id.vendor_id && s.fact_key === a.p_id.fact_key);
      if (!step) return new Response(JSON.stringify({ ok: false, code: "not_found" }), { status: 200 });
      const code = step.sealed
        ? "step_sealed"
        : !a.p_entitlements.includes("*") && !a.p_entitlements.includes(a.p_required)
          ? "role_required"
          : null;
      if (code) {
        evidence.push({ author: a.p_actor, reasoning: code, status: "refused" });
        return new Response(JSON.stringify({ ok: false, code, change_id: `chg-${evidence.length}` }), { status: 200 });
      }
      return new Response(
        JSON.stringify({ ok: true, change_id: "chg-ok", row: { tenant_id: step.tenant_id, vendor_id: step.vendor_id, fact_key: step.fact_key, status: "IN PROGRESS", sealed: false } }),
        { status: 200 }
      );
    }
    if (url === `${ENV.cubeUrl}/rest/v1/rpc/fn_meter_app_action`) {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    throw new Error(`unexpected upstream call: ${url}`);
  }) as unknown as typeof fetch;

  return { fetch: fetchImpl, calls, evidence };
}

function get(query: Record<string, string>, token?: string, extra: Record<string, string> = {}) {
  const headers: Record<string, string> = { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extra };
  return {
    method: "GET",
    url: `https://shell.example/api/cube/can?${new URLSearchParams(query).toString()}`,
    headers: { get: (n: string) => headers[n] ?? headers[n.toLowerCase()] ?? null },
  };
}

function post(body: unknown, token: string) {
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  return {
    method: "POST",
    url: "https://shell.example/api/cube/lending_vendor_checklist",
    headers: { get: (n: string) => headers[n] ?? headers[n.toLowerCase()] ?? null },
    json: async () => body,
  };
}

const STEP = "lending_vendor_checklist";
const OPEN_ID = `${PAYFLOW}:subcontractor_disclosure`;
const SEALED_ID = `${PAYFLOW}:soc2_type_ii_report`;

async function can(query: Record<string, string>, token: string, opts: Opts = {}) {
  const up = fakeUpstream(opts);
  const res = await handleCubeRequest(get(query, token), { env: ENV, fetch: up.fetch });
  const body = res.body as { rows?: Array<Record<string, unknown>> };
  return { res, verdict: body.rows?.[0], up };
}

describe("role_held is the entitlement key, case-folded", () => {
  const grant = (entitlements: string[]) => ({ tenantId: TENANT, entitlements });

  it("is `lending.role.` + lower(owner_role), with no mapping table", () => {
    expect(roleKey("Risk")).toBe("lending.role.risk");
    expect(roleKey("vendor-risk")).toBe("lending.role.vendor-risk");
    expect(roleKey("Compliance")).toBe("lending.role.compliance");
    expect(roleHeld(grant(["lending.role.risk"]), "Risk")).toBe(true);
    expect(roleHeld(grant(["lending.role.Risk"]), "Risk")).toBe(false);
    expect(roleHeld(grant(["lending.books", "lending.evidence"]), "vendor-risk")).toBe(false);
  });

  it("honours the wildcard, because the wall does", () => {
    expect(roleHeld(grant(["*"]), "vendor-risk")).toBe(true);
  });
});

describe("gate evaluation fails closed", () => {
  const rule = (kind: string, ownerRole = "vendor-risk"): GateRule => ({ ruleKey: `k-${kind}`, version: 1, label: "L.", description: "D.", ownerRole, kind });
  const holder = { tenantId: TENANT, entitlements: [ROLE] };

  it("refuses on a condition kind it does not know, with no rule to cite", () => {
    expect(evaluateGates([rule("role_and_flag", "Risk")], holder, null)).toEqual({ can: false, rule: null });
    expect(evaluateGates([rule("")], holder, null)).toEqual({ can: false, rule: null });
  });

  it("refuses a role gate whose row names no owner", () => {
    expect(evaluateGates([rule("role", "")], holder, null)).toEqual({ can: false, rule: null });
  });

  it("maps a wall code to the gate of that kind, and nothing else", () => {
    const gates = [rule("sealed", "compliance"), rule("role")];
    expect(gateForCode(gates, "step_sealed")?.ruleKey).toBe("k-sealed");
    expect(gateForCode(gates, "role_required")?.ruleKey).toBe("k-role");
    expect(gateForCode(gates, "write_not_allowed")).toBeNull();
    expect(gateForCode(gates, "not_found")).toBeNull();
  });

  it("composes the reason from label then description", () => {
    expect(reasonOf(rule("role"))).toBe("L. D.");
  });
});

describe("GET /api/cube/can — a vendor checklist step", () => {
  const [sealedGate, roleGate] = gateRows(TENANT);

  it("refuses a member without lending.role.vendor-risk, naming the rule and showing its text", async () => {
    const { res, verdict } = await can({ resource: STEP, action: "edit", id: OPEN_ID }, "token-member");
    expect(res.status).toBe(200);
    expect(verdict).toEqual({
      can: false,
      reason: `${roleGate.label} ${roleGate.description}`,
      rule_key: "bw-gate-vendor-step-write",
      version: 1,
      label: roleGate.label,
      description: roleGate.description,
    });
    expect(res.headers["cache-control"]).toBe("no-store");
  });

  it("allows a member who holds the role, on a step that is not sealed", async () => {
    const { verdict } = await can({ resource: STEP, action: "edit", id: OPEN_ID }, "token-risk");
    expect(verdict).toEqual({ can: true });
  });

  it("refuses a SEALED step for the role holder and the operator alike — sealed is checked first", async () => {
    for (const token of ["token-risk", "token-operator", "token-member"]) {
      const { verdict } = await can({ resource: STEP, action: "update", id: SEALED_ID }, token);
      expect(verdict, token).toMatchObject({
        can: false,
        rule_key: "bw-gate-step-sealed",
        reason: `${sealedGate.label} ${sealedGate.description}`,
      });
    }
  });

  it("answers for the action in general when no step is named: the role, not the seal", async () => {
    expect((await can({ resource: STEP, action: "edit" }, "token-risk")).verdict).toEqual({ can: true });
    expect((await can({ resource: STEP, action: "edit" }, "token-member")).verdict).toMatchObject({ can: false, rule_key: "bw-gate-vendor-step-write" });
  });

  it("does not count lending.vendors.write as the role — the rule row's owner_role is the only key", async () => {
    const { verdict } = await can({ resource: STEP, action: "edit", id: OPEN_ID }, "token-other-write");
    expect(verdict).toMatchObject({ can: false, rule_key: "bw-gate-vendor-step-write" });
  });

  it("shows whatever the row says — a reworded rule is a reworded reason, with no code change", async () => {
    const reworded = gateRows(TENANT).map((r) => (r.rule_key === "bw-gate-vendor-step-write" ? { ...r, version: 2, label: "New words.", description: "From the row." } : r));
    const { verdict } = await can({ resource: STEP, action: "edit", id: OPEN_ID }, "token-member", { gateRows: reworded });
    expect(verdict).toMatchObject({ reason: "New words. From the row.", version: 2 });
  });
});

describe("a bare no — refused, with no rule invented for it", () => {
  it("for an action the write allowlist does not open, an unknown resource, and a decision sign-off with no door yet", async () => {
    const cases: Array<Record<string, string>> = [
      { resource: STEP, action: "delete", id: OPEN_ID },
      { resource: STEP, action: "create" },
      { resource: STEP, action: "signoff" },
      { resource: "lending_decisions", action: "signoff", id: "d-1" },
      { resource: "no_such_thing", action: "edit" },
      { resource: "constructor", action: "edit" },
    ];
    for (const q of cases) {
      const { res, verdict } = await can(q, "token-operator");
      expect(res.status, JSON.stringify(q)).toBe(200);
      expect(verdict, JSON.stringify(q)).toEqual({ can: false });
    }
  });

  it("for a caller who cannot read the resource — and without reading a gate for them", async () => {
    const { verdict, up } = await can({ resource: STEP, action: "edit", id: OPEN_ID }, "token-stranger");
    expect(verdict).toEqual({ can: false });
    expect(up.calls.some((u) => u.includes("bw_v_gate_rules"))).toBe(false);
  });

  it("for a step that does not exist, or exists only in another tenant", async () => {
    expect((await can({ resource: STEP, action: "edit", id: `${PAYFLOW}:no_such_step` }, "token-risk")).verdict).toEqual({ can: false });
    expect((await can({ resource: STEP, action: "edit", id: `${RIVAL}:subcontractor_disclosure` }, "token-risk")).verdict).toEqual({ can: false });
  });

  it("when a bound gate row cannot be read — never a yes", async () => {
    const cases: Opts[] = [
      { gateStatus: 500 },
      { gateRows: [] },
      { gateRows: gateRows(TENANT).filter((r) => r.rule_key !== "bw-gate-step-sealed") },
      { gateRows: gateRows(OTHER_TENANT) },
    ];
    for (const opts of cases) {
      const { verdict } = await can({ resource: STEP, action: "edit", id: OPEN_ID }, "token-operator", opts);
      expect(verdict, JSON.stringify(opts).slice(0, 50)).toEqual({ can: false });
    }
  });
});

describe("reads are answered from the read allowlist", () => {
  it("says yes to someone entitled to the resource and no to someone who is not", async () => {
    expect((await can({ resource: STEP, action: "list" }, "token-member")).verdict).toEqual({ can: true });
    expect((await can({ resource: STEP, action: "show" }, "token-stranger")).verdict).toEqual({ can: false });
    expect((await can({ resource: "no_such_thing", action: "list" }, "token-operator")).verdict).toEqual({ can: false });
  });
});

describe("the door itself", () => {
  it("refuses anonymous and forged sessions before anything on the Cube is read", async () => {
    for (const token of [undefined, "forged"]) {
      const up = fakeUpstream();
      const res = await handleCubeRequest(get({ resource: STEP, action: "edit" }, token), { env: ENV, fetch: up.fetch });
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: "not_authenticated" });
      expect(up.calls.some((u) => u.startsWith(ENV.cubeUrl))).toBe(false);
    }
  });

  it("refuses a malformed question", async () => {
    const bad: Array<Record<string, string>> = [
      {},
      { resource: STEP },
      { action: "edit" },
      { resource: "a,b)", action: "edit" },
      { resource: STEP, action: "edit", id: "not-a-uuid:x" },
      { resource: STEP, action: "edit", id: PAYFLOW },
      { resource: STEP, action: "edit", id: `${PAYFLOW}:a,b)` },
      { resource: STEP, action: "edit", id: `${PAYFLOW}:a:b` },
    ];
    for (const q of bad) {
      const up = fakeUpstream();
      const res = await handleCubeRequest(get(q, "token-risk"), { env: ENV, fetch: up.fetch });
      expect(res.status, JSON.stringify(q)).toBe(400);
      expect(res.body).toEqual({ error: "bad_filter" });
    }
  });

  it("never carries the Cube credential or a table name in its answer", async () => {
    const { res } = await can({ resource: STEP, action: "edit", id: OPEN_ID }, "token-member");
    const text = JSON.stringify(res.body);
    expect(text).not.toContain(CUBE_SECRET);
    expect(text).not.toContain("obligation_rules");
    expect(text).not.toContain("bw_v_gate_rules");
  });
});

describe("AGREEMENT: the rule `can` names is the rule the write is refused with", () => {
  const cases: Array<[string, string, string]> = [
    ["token-member", OPEN_ID, "bw-gate-vendor-step-write"],
    ["token-member", SEALED_ID, "bw-gate-step-sealed"],
    ["token-risk", SEALED_ID, "bw-gate-step-sealed"],
    ["token-operator", SEALED_ID, "bw-gate-step-sealed"],
  ];

  it.each(cases)("%s on %s → %s from both doors, and the refusal is recorded", async (token, id, ruleKey) => {
    const [vendor_id, fact_key] = id.split(":");
    const up = fakeUpstream();
    const deps = { env: ENV, fetch: up.fetch };

    const before = await handleCubeRequest(get({ resource: STEP, action: "edit", id }, token), deps);
    const named = (before.body as { rows: Array<Record<string, unknown>> }).rows[0];

    const attempt = await handleCubeRequest(post({ action: "update", id: { vendor_id, fact_key }, values: { status: "IN PROGRESS" } }, token), deps);
    const refusal = attempt.body as Record<string, unknown>;

    expect(named.can).toBe(false);
    expect(named.rule_key).toBe(ruleKey);
    expect(attempt.status).toBe(403);
    expect(refusal.rule_key).toBe(named.rule_key);
    expect(refusal.version).toBe(named.version);
    expect(`${refusal.label} ${refusal.description}`).toBe(named.reason);
    expect(up.evidence).toHaveLength(1);
    expect(up.evidence[0]).toMatchObject({ status: "refused", author: `${USERS[token].id}@example.test` });
  });

  it("and where `can` says yes, the write goes through", async () => {
    const up = fakeUpstream();
    const deps = { env: ENV, fetch: up.fetch };
    const before = await handleCubeRequest(get({ resource: STEP, action: "edit", id: OPEN_ID }, "token-risk"), deps);
    expect((before.body as { rows: unknown[] }).rows[0]).toEqual({ can: true });

    const attempt = await handleCubeRequest(
      post({ action: "update", id: { vendor_id: PAYFLOW, fact_key: "subcontractor_disclosure" }, values: { status: "IN PROGRESS" } }, "token-risk"),
      deps
    );
    expect(attempt.status).toBe(200);
    expect(up.evidence).toHaveLength(0);
  });
});
