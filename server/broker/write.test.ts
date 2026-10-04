import { describe, expect, it } from "vitest";
import { buildCubeQuery, handleCubeRequest } from "./handler";
import { BROKER_RESOURCES, BROKER_WRITES } from "./resources";
import type { BrokerEnv } from "./env";
import { answerGateRead, gateRows, type GateRow } from "./gates.fixture";

/**
 * The write door (BOR-130).
 *
 * The fake wall below is not a stub that says yes. It holds rows under two
 * tenants and ACTUALLY APPLIES the same three checks the Cube function does —
 * tenant, sealed, entitlement — against the arguments the broker sent it. So if
 * the broker ever forwarded a tenant the caller chose, or dropped the caller's
 * entitlements, these tests would write the wrong row or allow the wrong user,
 * and fail. A fake that always returned `{ok:true}` would prove nothing.
 */

const CUBE_SECRET = "cube-broker-key-must-never-leak";

const ENV: BrokerEnv = {
  masterUrl: "https://master.example",
  masterAnonKey: "master-anon-key",
  cubeUrl: "https://cube.example",
  cubeKey: CUBE_SECRET,
  cubeSchema: "legal",
  membershipTable: "shell_tenant_members",
};

const TENANT = "6f361690-9876-43e8-b5bd-9bba6c44ae68";
const OTHER_TENANT = "3018ac90-5d2d-45b4-87b4-a34f1b66d1e8";
const PAYFLOW = "862552ac-c4a1-45ae-8a3e-068c9a9ecdda";
const RIVAL = "99999999-9999-4999-8999-999999999999";

interface Fact {
  tenant_id: string;
  vendor_id: string;
  fact_key: string;
  value: Record<string, unknown>;
}

interface Evidence {
  tenant_id: string;
  path: string;
  author: string;
  status: "applied" | "refused";
  reasoning: string | null;
  before_state: unknown;
  after_state: unknown;
}

function freshFacts(): Fact[] {
  return [
    { tenant_id: TENANT, vendor_id: PAYFLOW, fact_key: "subcontractor_disclosure", value: { title: "Subcontractor disclosure", status: "NOT STARTED" } },
    { tenant_id: TENANT, vendor_id: PAYFLOW, fact_key: "soc2_report", value: { title: "SOC 2 report", status: "COMPLETE", sealed: true } },
    { tenant_id: OTHER_TENANT, vendor_id: RIVAL, fact_key: "subcontractor_disclosure", value: { title: "Subcontractor disclosure", status: "NOT STARTED" } },
  ];
}

interface Member {
  tenant_id: string;
  entitlements: string[];
  status: string;
}

interface FakeOptions {
  users?: Record<string, string>;
  memberships?: Record<string, Member[]>;
  wallStatus?: number;
  wallBody?: unknown;
  wallThrows?: boolean;
  /** The gate view: a failing status, or rows other than the three real ones. */
  gateStatus?: number;
  gateRows?: GateRow[];
}

function fakeUpstream(opts: FakeOptions) {
  const calls: Array<{ url: string; headers: Record<string, string>; body: unknown }> = [];
  const facts = freshFacts();
  const evidence: Evidence[] = [];

  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const headers = Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>));
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
    calls.push({ url, headers, body });

    const bearer = (headers.Authorization ?? "").replace(/^Bearer\s+/, "");

    if (url.startsWith(`${ENV.masterUrl}/auth/v1/user`)) {
      const id = opts.users?.[bearer];
      return id
        ? new Response(JSON.stringify({ id, email: `${id}@example.test` }), { status: 200 })
        : new Response("{}", { status: 401 });
    }

    if (url.startsWith(`${ENV.masterUrl}/rest/v1/${ENV.membershipTable}`)) {
      const id = opts.users?.[bearer];
      return new Response(JSON.stringify((id && opts.memberships?.[id]) || []), { status: 200 });
    }

    if (url.startsWith(`${ENV.cubeUrl}/rest/v1/bw_v_gate_rules?`)) {
      if (opts.gateStatus) return new Response(JSON.stringify({ message: "relation obligation.obligation_rules" }), { status: opts.gateStatus });
      return answerGateRead(url, opts.gateRows ?? [...gateRows(TENANT), ...gateRows(OTHER_TENANT)]);
    }

    if (url === `${ENV.cubeUrl}/rest/v1/rpc/fn_meter_app_action`) {
      return new Response(JSON.stringify({ ok: true, reason: "counted" }), { status: 200 });
    }

    if (url === `${ENV.cubeUrl}/rest/v1/rpc/fn_broker_write`) {
      if (opts.wallThrows) throw new Error("network down");
      if (opts.wallStatus && opts.wallStatus >= 400) {
        return new Response(JSON.stringify({ message: 'function lending.fn_broker_write does not exist', hint: "schema cache" }), { status: opts.wallStatus });
      }
      if (opts.wallBody !== undefined) return new Response(JSON.stringify(opts.wallBody), { status: 200 });

      // The wall, in miniature. Everything keys on what the BROKER sent.
      const a = body as {
        p_tenant: string; p_actor: string; p_entitlements: string[]; p_required: string;
        p_resource: string; p_action: string; p_id: { vendor_id: string; fact_key: string }; p_values: Record<string, string>;
      };
      const fact = facts.find(
        (f) => f.tenant_id === a.p_tenant && f.vendor_id === a.p_id.vendor_id && f.fact_key === a.p_id.fact_key
      );
      if (!fact) return new Response(JSON.stringify({ ok: false, code: "not_found" }), { status: 200 });

      const path = `vendors/${a.p_id.vendor_id}/${a.p_id.fact_key}`;
      const refuse = (code: string) => {
        evidence.push({ tenant_id: a.p_tenant, path, author: a.p_actor, status: "refused", reasoning: code, before_state: fact.value, after_state: a.p_values });
        return new Response(JSON.stringify({ ok: false, code, change_id: `chg-${evidence.length}` }), { status: 200 });
      };
      // Sealed BEFORE role, as the wall now checks (BOR-132).
      if (fact.value.sealed === true) return refuse("step_sealed");
      if (!a.p_entitlements.includes("*") && !a.p_entitlements.includes(a.p_required)) return refuse("role_required");

      const before = fact.value;
      fact.value = { ...fact.value, ...a.p_values, updated_by: a.p_actor };
      evidence.push({ tenant_id: a.p_tenant, path, author: a.p_actor, status: "applied", reasoning: null, before_state: before, after_state: fact.value });
      return new Response(
        JSON.stringify({
          ok: true,
          change_id: `chg-${evidence.length}`,
          row: {
            tenant_id: fact.tenant_id, vendor_id: fact.vendor_id, title: fact.value.title,
            status: fact.value.status, sealed: fact.value.sealed === true, detail: fact.value.detail ?? null,
            fact_key: fact.fact_key, recorded_at: "2026-09-04T05:50:47Z",
          },
        }),
        { status: 200 }
      );
    }

    throw new Error(`unexpected upstream call: ${url}`);
  }) as unknown as typeof fetch;

  return { fetch: fetchImpl, calls, facts, evidence };
}

function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return {
    method: "POST",
    url: `https://shell.example${path}`,
    headers: { get: (n: string) => headers[n] ?? headers[n.toLowerCase()] ?? null },
    json: async () => body,
  };
}

const READ = "lending.evidence";
/** Not written in the allowlist: derived from the role gate's own row (owner_role `vendor-risk`). */
const WRITE = "lending.role.vendor-risk";

/** user-w may write; user-r may only read; user-o belongs to the OTHER tenant and may write there. */
const PEOPLE: FakeOptions = {
  users: { "token-w": "user-w", "token-r": "user-r", "token-o": "user-o", "token-n": "user-n" },
  memberships: {
    "user-w": [{ tenant_id: TENANT, entitlements: [READ, WRITE], status: "active" }],
    "user-r": [{ tenant_id: TENANT, entitlements: [READ], status: "active" }],
    "user-o": [{ tenant_id: OTHER_TENANT, entitlements: [READ, WRITE], status: "active" }],
    "user-n": [{ tenant_id: TENANT, entitlements: ["legal.rates"], status: "active" }],
  },
};

const PATH = "/api/cube/lending_vendor_checklist";
const STEP = { vendor_id: PAYFLOW, fact_key: "subcontractor_disclosure" };
const START = { action: "update", id: STEP, values: { status: "IN PROGRESS" } };

const as = (token: string) => ({ Authorization: `Bearer ${token}` });
const wallCalls = (up: ReturnType<typeof fakeUpstream>) => up.calls.filter((c) => c.url.endsWith("/rpc/fn_broker_write"));

describe("the write allowlist", () => {
  it("opens exactly one writable resource", () => {
    // A second one is a decision. This test is where that decision is noticed.
    expect(Object.keys(BROKER_WRITES)).toEqual(["lending_vendor_checklist"]);
  });

  it("only names resources the read allowlist also names", () => {
    for (const name of Object.keys(BROKER_WRITES)) {
      expect(BROKER_RESOURCES[name], name).toBeTruthy();
    }
  });
});

describe("a write round-trips through the wall", () => {
  it("changes the step, returns the row as it now stands, and leaves one applied evidence row", async () => {
    const up = fakeUpstream(PEOPLE);
    const res = await handleCubeRequest(post(PATH, START, as("token-w")), { env: ENV, fetch: up.fetch });

    expect(res.status).toBe(200);
    const body = res.body as { ok: boolean; row: Record<string, unknown>; change_id: string };
    expect(body.ok).toBe(true);
    expect(body.row.status).toBe("IN PROGRESS");
    expect(body.row.fact_key).toBe("subcontractor_disclosure");

    expect(up.facts[0].value.status).toBe("IN PROGRESS");
    expect(up.evidence).toHaveLength(1);
    expect(up.evidence[0]).toMatchObject({
      status: "applied",
      author: "user-w@example.test",
      before_state: { status: "NOT STARTED" },
      after_state: { status: "IN PROGRESS" },
    });
  });

  it("sends the wall the SERVER's facts — tenant, actor and entitlements — never the caller's", async () => {
    const up = fakeUpstream(PEOPLE);
    await handleCubeRequest(
      post(PATH, { ...START, tenant_id: OTHER_TENANT, actor: "boss@example.test", entitlements: ["*"], p_tenant: OTHER_TENANT }, as("token-w")),
      { env: ENV, fetch: up.fetch }
    );

    const [call] = wallCalls(up);
    expect(call.body).toEqual({
      p_tenant: TENANT,
      p_actor: "user-w@example.test",
      p_entitlements: [READ, WRITE],
      p_required: WRITE,
      p_resource: "lending_vendor_checklist",
      p_action: "update",
      p_id: STEP,
      p_values: { status: "IN PROGRESS" },
    });
    expect(call.headers["Content-Profile"]).toBe("lending");
  });

  it("meters a write that happened", async () => {
    const up = fakeUpstream(PEOPLE);
    await handleCubeRequest(post(PATH, START, as("token-w")), { env: ENV, fetch: up.fetch });

    const meter = up.calls.find((c) => c.url.endsWith("/rpc/fn_meter_app_action"));
    expect(meter?.body).toMatchObject({ p_tenant: TENANT, p_handler: "handleWrite", p_method: "POST", p_resource: "lending_vendor_checklist" });
  });
});

describe("a user without the role is refused by the wall, and nothing changes", () => {
  it("returns the wall's own code, writes no fact, and leaves a refused evidence row", async () => {
    const up = fakeUpstream(PEOPLE);
    const res = await handleCubeRequest(post(PATH, START, as("token-r")), { env: ENV, fetch: up.fetch });

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ ok: false, error: "role_required" });

    // The probe the ticket asks for: the refused attempt did NOT write.
    expect(up.facts).toEqual(freshFacts());
    expect(up.evidence).toHaveLength(1);
    expect(up.evidence[0]).toMatchObject({ status: "refused", reasoning: "role_required", author: "user-r@example.test" });
  });

  it("does not meter a refusal", async () => {
    const up = fakeUpstream(PEOPLE);
    await handleCubeRequest(post(PATH, START, as("token-r")), { env: ENV, fetch: up.fetch });
    expect(up.calls.some((c) => c.url.endsWith("/rpc/fn_meter_app_action"))).toBe(false);
  });

  it("refuses a sealed step even for someone who holds the role", async () => {
    const up = fakeUpstream(PEOPLE);
    const res = await handleCubeRequest(
      post(PATH, { action: "update", id: { vendor_id: PAYFLOW, fact_key: "soc2_report" }, values: { status: "NOT STARTED" } }, as("token-w")),
      { env: ENV, fetch: up.fetch }
    );
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ ok: false, error: "step_sealed" });
    expect(up.facts).toEqual(freshFacts());
  });
});

describe("a refusal names its rule, in the rule row's own words (BOR-132)", () => {
  const SEALED_STEP = { action: "update", id: { vendor_id: PAYFLOW, fact_key: "soc2_report" }, values: { status: "NOT STARTED" } };

  it("maps role_required to the role gate bound to this action, with label and description from the row", async () => {
    const up = fakeUpstream(PEOPLE);
    const res = await handleCubeRequest(post(PATH, START, as("token-r")), { env: ENV, fetch: up.fetch });
    const [, roleGate] = gateRows(TENANT);

    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      ok: false,
      error: "role_required",
      refused: true,
      rule_key: "bw-gate-vendor-step-write",
      version: 1,
      label: roleGate.label,
      description: roleGate.description,
      change_id: "chg-1",
    });
  });

  it("shows the words the ROW carries, not words the broker holds", async () => {
    const reworded = gateRows(TENANT).map((r) =>
      r.rule_key === "bw-gate-vendor-step-write" ? { ...r, version: 2, label: "Reworded.", description: "A new version row." } : r
    );
    const up = fakeUpstream({ ...PEOPLE, gateRows: reworded });
    const res = await handleCubeRequest(post(PATH, START, as("token-r")), { env: ENV, fetch: up.fetch });
    expect(res.body).toMatchObject({ rule_key: "bw-gate-vendor-step-write", version: 2, label: "Reworded.", description: "A new version row." });
  });

  it("refuses a sealed step as SEALED for someone without the role too — sealed is checked first", async () => {
    const up = fakeUpstream(PEOPLE);
    const res = await handleCubeRequest(post(PATH, SEALED_STEP, as("token-r")), { env: ENV, fetch: up.fetch });
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: "step_sealed", refused: true, rule_key: "bw-gate-step-sealed", label: "This step is sealed." });
    expect(up.evidence[0]).toMatchObject({ status: "refused", reasoning: "step_sealed" });
  });

  it("leaves a code that is not a gate as a bare code", async () => {
    const up = fakeUpstream({ ...PEOPLE, wallBody: { ok: false, code: "write_not_allowed" } });
    const res = await handleCubeRequest(post(PATH, START, as("token-w")), { env: ENV, fetch: up.fetch });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ ok: false, error: "write_not_allowed" });
  });

  it("asks the wall to require the role gate's entitlement, derived from the row's owner_role", async () => {
    const renamed = gateRows(TENANT).map((r) => (r.rule_key === "bw-gate-vendor-step-write" ? { ...r, owner_role: "Third-Party" } : r));
    const up = fakeUpstream({ ...PEOPLE, gateRows: renamed });
    await handleCubeRequest(post(PATH, START, as("token-w")), { env: ENV, fetch: up.fetch });
    expect((wallCalls(up)[0].body as { p_required: string }).p_required).toBe("lending.role.third-party");
  });

  it("does not ask the wall at all when a bound gate cannot be read", async () => {
    const cases: FakeOptions[] = [
      { gateStatus: 404 },
      { gateStatus: 500 },
      // The binding names a rule that has no row.
      { gateRows: gateRows(TENANT).filter((r) => r.rule_key !== "bw-gate-step-sealed") },
      // Rows exist, but under another tenant.
      { gateRows: gateRows(OTHER_TENANT) },
    ];
    for (const opts of cases) {
      const up = fakeUpstream({ ...PEOPLE, ...opts });
      const logs: string[] = [];
      const res = await handleCubeRequest(post(PATH, START, as("token-w")), { env: ENV, fetch: up.fetch, log: (m) => logs.push(m) });
      expect(res.status, JSON.stringify(opts).slice(0, 60)).toBe(502);
      expect(res.body).toEqual({ error: "upstream_error" });
      expect(wallCalls(up)).toHaveLength(0);
      expect(up.facts).toEqual(freshFacts());
      expect(JSON.stringify(res.body) + logs.join("\n")).not.toContain("obligation_rules");
    }
  });
});

describe("tenant isolation holds on the write path", () => {
  it("cannot reach another tenant's step by naming its vendor", async () => {
    const up = fakeUpstream(PEOPLE);
    const res = await handleCubeRequest(
      post(PATH, { action: "update", id: { vendor_id: RIVAL, fact_key: "subcontractor_disclosure" }, values: { status: "COMPLETE" } }, as("token-w")),
      { env: ENV, fetch: up.fetch }
    );

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ ok: false, error: "not_found" });
    expect(up.facts).toEqual(freshFacts());
  });

  it("refuses an X-Tenant-Id the caller does not belong to before the wall is asked", async () => {
    const up = fakeUpstream(PEOPLE);
    const res = await handleCubeRequest(post(PATH, START, { ...as("token-w"), "X-Tenant-Id": OTHER_TENANT }), {
      env: ENV,
      fetch: up.fetch,
    });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "tenant_unresolved" });
    expect(wallCalls(up)).toHaveLength(0);
  });

  it("does not return a row the wall handed back under another tenant", async () => {
    const up = fakeUpstream({ ...PEOPLE, wallBody: { ok: true, row: { tenant_id: OTHER_TENANT, vendor_id: RIVAL, status: "COMPLETE" } } });
    const res = await handleCubeRequest(post(PATH, START, as("token-w")), { env: ENV, fetch: up.fetch });
    expect(res.status).toBe(502);
    expect(JSON.stringify(res.body)).not.toContain(RIVAL);
  });
});

describe("the door refuses before the wall is asked", () => {
  it("refuses anonymous, a forged token, and a tenant with no reach to the surface", async () => {
    const up = fakeUpstream(PEOPLE);
    const cases: Array<[Record<string, string>, number, string]> = [
      [{}, 401, "not_authenticated"],
      [as("forged"), 401, "not_authenticated"],
      [as("token-n"), 403, "not_entitled"],
    ];
    for (const [headers, status, error] of cases) {
      const res = await handleCubeRequest(post(PATH, START, headers), { env: ENV, fetch: up.fetch });
      expect(res.status, error).toBe(status);
      expect(res.body, error).toEqual({ error });
    }
    expect(wallCalls(up)).toHaveLength(0);
  });

  it("refuses a body that names anything the allowlist does not", async () => {
    const up = fakeUpstream(PEOPLE);
    const bad: Array<[unknown, number, string]> = [
      [null, 400, "bad_body"],
      [[START], 400, "bad_body"],
      [{ ...START, action: "upsert" }, 400, "bad_body"],
      [{ ...START, action: "delete" }, 405, "action_not_allowed"],
      [{ ...START, action: "create" }, 405, "action_not_allowed"],
      [{ ...START, id: { vendor_id: PAYFLOW } }, 400, "bad_id"],
      [{ ...START, id: { ...STEP, tenant_id: TENANT } }, 400, "bad_id"],
      [{ ...START, id: { vendor_id: "not-a-uuid", fact_key: "x" } }, 400, "bad_id"],
      [{ ...START, id: { vendor_id: PAYFLOW, fact_key: "a,b)" } }, 400, "bad_id"],
      [{ ...START, values: {} }, 400, "bad_field"],
      [{ ...START, values: { status: "DONE-ISH" } }, 400, "bad_field"],
      [{ ...START, values: { status: "COMPLETE", sealed: "true" } }, 400, "bad_field"],
      [{ ...START, values: { status: 1 } }, 400, "bad_field"],
      [{ ...START, values: { detail: "x".repeat(2001) } }, 400, "bad_field"],
    ];
    for (const [body, status, error] of bad) {
      const res = await handleCubeRequest(post(PATH, body, as("token-w")), { env: ENV, fetch: up.fetch });
      expect(res.status, JSON.stringify(body)?.slice(0, 80)).toBe(status);
      expect(res.body).toEqual({ error });
    }
    expect(wallCalls(up)).toHaveLength(0);
    expect(up.facts).toEqual(freshFacts());
  });
});

describe("the write path never leaks upstream detail or the credential", () => {
  it("answers a missing or failing wall with a code only", async () => {
    for (const opts of [{ wallStatus: 404 }, { wallStatus: 500 }, { wallThrows: true }, { wallBody: "nope" }, { wallBody: { ok: false, code: "DROP TABLE; --" } }, { wallBody: { ok: true } }]) {
      const up = fakeUpstream({ ...PEOPLE, ...opts });
      const logs: string[] = [];
      const res = await handleCubeRequest(post(PATH, START, as("token-w")), { env: ENV, fetch: up.fetch, log: (m) => logs.push(m) });

      expect(res.status, JSON.stringify(opts)).toBe(502);
      const text = JSON.stringify(res.body) + logs.join("\n");
      expect(text).not.toContain(CUBE_SECRET);
      expect(text).not.toContain("fn_broker_write");
      expect(text).not.toContain("DROP TABLE");
      expect(text).not.toContain("cube.example");
    }
  });
});

describe("row addressing on reads (id / ids)", () => {
  const vendors = BROKER_RESOURCES.lending_vendors;
  const checklist = BROKER_RESOURCES.lending_vendor_checklist;

  it("narrows to one row UNDER the tenant filter, not instead of it", () => {
    const q = buildCubeQuery(vendors, TENANT, new URLSearchParams({ id: PAYFLOW })) as URLSearchParams;
    expect(q.get("tenant_id")).toBe(`eq.${TENANT}`);
    expect(q.get("vendor_id")).toBe(`eq.${PAYFLOW}`);
  });

  it("narrows to several rows with ids", () => {
    const q = buildCubeQuery(vendors, TENANT, new URLSearchParams({ ids: `${PAYFLOW},${RIVAL}` })) as URLSearchParams;
    expect(q.get("vendor_id")).toBe(`in.(${PAYFLOW},${RIVAL})`);
    expect(q.get("tenant_id")).toBe(`eq.${TENANT}`);
  });

  it("refuses an id on a resource that declares no id column, rather than ignoring it", () => {
    expect(buildCubeQuery(checklist, TENANT, new URLSearchParams({ id: "x" }))).toEqual({ error: "bad_filter" });
  });

  it("refuses ids that carry operator syntax, and more ids than the ceiling", () => {
    expect(buildCubeQuery(vendors, TENANT, new URLSearchParams({ id: "a)or(1" }))).toEqual({ error: "bad_filter" });
    expect(buildCubeQuery(vendors, TENANT, new URLSearchParams({ ids: "a,b);drop" }))).toEqual({ error: "bad_filter" });
    const many = Array.from({ length: 101 }, (_, i) => `id${i}`).join(",");
    expect(buildCubeQuery(vendors, TENANT, new URLSearchParams({ ids: many }))).toEqual({ error: "bad_filter" });
  });
});
