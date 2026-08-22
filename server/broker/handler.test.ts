import { describe, expect, it } from "vitest";
import { handleCubeRequest, buildCubeQuery, resourceNameFromPath } from "./handler";
import { BROKER_RESOURCES } from "./resources";
import type { BrokerEnv } from "./env";

/**
 * Broker tests.
 *
 * The fake upstream is a small PostgREST impersonation that ACTUALLY HONOURS
 * the filters it is sent. That is the point: if the broker ever stopped
 * applying the tenant predicate, the fake would happily hand back both
 * tenants' rows and the "sees only their tenant" test would fail. A fake that
 * always returned one tenant would prove nothing.
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

const TENANT_A = "11111111-1111-4111-8111-111111111111";
const TENANT_B = "22222222-2222-4222-8222-222222222222";

const RATE_ROWS = [
  { id: "r1", tenant_id: TENANT_A, role: "partner", hourly_rate: 650, locale: "TX", basis: "standard" },
  { id: "r2", tenant_id: TENANT_A, role: "associate", hourly_rate: 350, locale: "TX", basis: "standard" },
  { id: "r3", tenant_id: TENANT_B, role: "partner", hourly_rate: 900, locale: "NY", basis: "premium" },
];

interface Membership {
  tenant_id: string;
  entitlements: string[] | null;
  status: string;
}

interface UpstreamCall {
  url: string;
  headers: Record<string, string>;
}

interface FakeOptions {
  /** access token → master user id. Anything else is an invalid token. */
  users?: Record<string, string>;
  /** master user id → rows in the shell's tenancy table. */
  memberships?: Record<string, Membership[]>;
  cubeRows?: Array<Record<string, unknown>>;
  cubeStatus?: number;
  cubeThrows?: boolean;
}

function fakeUpstream(opts: FakeOptions) {
  const calls: UpstreamCall[] = [];

  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const headers = Object.fromEntries(
      Object.entries((init?.headers ?? {}) as Record<string, string>)
    );
    calls.push({ url, headers });

    const bearer = (headers.Authorization ?? "").replace(/^Bearer\s+/, "");

    if (url.startsWith(`${ENV.masterUrl}/auth/v1/user`)) {
      const id = opts.users?.[bearer];
      return id
        ? new Response(JSON.stringify({ id, email: `${id}@example.test` }), { status: 200 })
        : new Response(JSON.stringify({ msg: "invalid token" }), { status: 401 });
    }

    if (url.startsWith(`${ENV.masterUrl}/rest/v1/${ENV.membershipTable}`)) {
      // Master RLS would scope this; the fake stands in for it by keying on the
      // token's own user, not on the user_id filter in the query string.
      const id = opts.users?.[bearer];
      const rows = (id && opts.memberships?.[id]) || [];
      return new Response(JSON.stringify(rows), { status: 200 });
    }

    if (url.startsWith(`${ENV.cubeUrl}/rest/v1/`)) {
      if (opts.cubeThrows) throw new Error("network down");
      if (opts.cubeStatus && opts.cubeStatus >= 400) {
        return new Response(
          JSON.stringify({ message: 'relation "legal.ld_rate_card" does not exist', hint: "check schema" }),
          { status: opts.cubeStatus }
        );
      }
      const query = new URL(url).searchParams;
      let rows = opts.cubeRows ?? RATE_ROWS;
      for (const [key, value] of query.entries()) {
        if (key === "select" || key === "order" || key === "limit") continue;
        const match = /^eq\.(.*)$/.exec(value);
        if (match) rows = rows.filter((r) => String(r[key]) === match[1]);
      }
      const limit = Number(query.get("limit"));
      if (Number.isFinite(limit) && limit > 0) rows = rows.slice(0, limit);
      return new Response(JSON.stringify(rows), { status: 200 });
    }

    throw new Error(`unexpected upstream call: ${url}`);
  }) as unknown as typeof fetch;

  return { fetch: fetchImpl, calls };
}

function request(
  path: string,
  headers: Record<string, string> = {},
  method = "GET"
) {
  return {
    method,
    url: `https://shell.example${path}`,
    headers: {
      get: (name: string) => headers[name] ?? headers[name.toLowerCase()] ?? null,
    },
  };
}

const SIGNED_IN = { users: { "token-a": "user-a" }, memberships: { "user-a": [{ tenant_id: TENANT_A, entitlements: ["legal.rates"], status: "active" }] } };

const AUTH_A = { Authorization: "Bearer token-a" };

describe("(a) an unauthenticated caller is refused", () => {
  it("refuses a request with no Authorization header, before touching anything upstream", async () => {
    const up = fakeUpstream(SIGNED_IN);
    const res = await handleCubeRequest(request("/api/cube/rate_card"), { env: ENV, fetch: up.fetch });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "not_authenticated" });
    // The important half: anonymous costs nothing and reaches nothing.
    expect(up.calls).toHaveLength(0);
  });

  it("refuses a malformed Authorization header", async () => {
    const up = fakeUpstream(SIGNED_IN);
    for (const value of ["", "token-a", "Basic token-a", "Bearer", "Bearer   "]) {
      const res = await handleCubeRequest(request("/api/cube/rate_card", { Authorization: value }), {
        env: ENV,
        fetch: up.fetch,
      });
      expect(res.status).toBe(401);
    }
    expect(up.calls).toHaveLength(0);
  });

  it("refuses a bearer token master does not recognise, and never reaches the Cube", async () => {
    const up = fakeUpstream(SIGNED_IN);
    const res = await handleCubeRequest(
      request("/api/cube/rate_card", { Authorization: "Bearer forged-token" }),
      { env: ENV, fetch: up.fetch }
    );

    expect(res.status).toBe(401);
    expect(up.calls.every((c) => !c.url.startsWith(ENV.cubeUrl))).toBe(true);
  });

  it("refuses when the shell tables resolve no tenant, and never reaches the Cube", async () => {
    const up = fakeUpstream({ users: { "token-x": "user-x" }, memberships: { "user-x": [] } });
    const res = await handleCubeRequest(
      request("/api/cube/rate_card", { Authorization: "Bearer token-x" }),
      { env: ENV, fetch: up.fetch }
    );

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "tenant_unresolved" });
    expect(up.calls.every((c) => !c.url.startsWith(ENV.cubeUrl))).toBe(true);
  });

  it("refuses a resolved tenant that lacks the resource entitlement", async () => {
    const up = fakeUpstream({
      users: { "token-n": "user-n" },
      memberships: { "user-n": [{ tenant_id: TENANT_A, entitlements: ["legal.parties"], status: "active" }] },
    });
    const res = await handleCubeRequest(
      request("/api/cube/rate_card", { Authorization: "Bearer token-n" }),
      { env: ENV, fetch: up.fetch }
    );

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "not_entitled" });
    expect(up.calls.every((c) => !c.url.startsWith(ENV.cubeUrl))).toBe(true);
  });

  it("refuses a resource that is not on the allowlist, for everyone", async () => {
    const up = fakeUpstream(SIGNED_IN);
    for (const path of ["/api/cube/ld_documents", "/api/cube/users", "/api/cube/rate_card/extra", "/api/cube/__proto__"]) {
      const res = await handleCubeRequest(request(path, AUTH_A), { env: ENV, fetch: up.fetch });
      expect(res.status, path).toBe(404);
    }
    expect(up.calls).toHaveLength(0);
  });

  it("refuses every write method except the one POST, and refuses POST everywhere but the decision log", async () => {
    // This surface was reads-only until D-BWUI-1 ruled that the action register
    // must record what a human decided. That ruling opened exactly ONE door, and
    // this test is what keeps it one: PATCH/DELETE/PUT are still refused outright,
    // and POST is a 404 on every resource that is not the decision log.
    const up = fakeUpstream(SIGNED_IN);
    for (const method of ["PATCH", "DELETE", "PUT"]) {
      const res = await handleCubeRequest(request("/api/cube/rate_card", AUTH_A, method), {
        env: ENV,
        fetch: up.fetch,
      });
      expect(res.status, method).toBe(405);
    }
    for (const path of ["/api/cube/rate_card", "/api/cube/lending_books", "/api/cube/lending_interactions"]) {
      const res = await handleCubeRequest(request(path, AUTH_A, "POST"), {
        env: ENV,
        fetch: up.fetch,
      });
      expect(res.status, `POST ${path}`).toBe(404);
    }
    expect(up.calls).toHaveLength(0);
  });

  it("refuses an unauthenticated write to the one resource that does accept writes", async () => {
    const up = fakeUpstream(SIGNED_IN);
    const res = await handleCubeRequest(
      { method: "POST", url: "https://app.test/api/cube/lending_decision_log", headers: new Headers(), json: async () => ({}) },
      { env: ENV, fetch: up.fetch }
    );
    expect(res.status).toBe(401);
    expect(up.calls).toHaveLength(0);
  });
});

describe("(b) a master-session user sees only their own tenant's rows", () => {
  it("returns tenant A's rates and none of tenant B's", async () => {
    const up = fakeUpstream(SIGNED_IN);
    const res = await handleCubeRequest(request("/api/cube/rate_card", AUTH_A), {
      env: ENV,
      fetch: up.fetch,
    });

    expect(res.status).toBe(200);
    const body = res.body as { tenant: string; rows: Array<Record<string, unknown>> };
    expect(body.tenant).toBe(TENANT_A);
    expect(body.rows.map((r) => r.id).sort()).toEqual(["r1", "r2"]);
    expect(body.rows.every((r) => r.tenant_id === TENANT_A)).toBe(true);
  });

  it("scopes the upstream query itself — the tenant filter goes UP, not just down", async () => {
    const up = fakeUpstream(SIGNED_IN);
    await handleCubeRequest(request("/api/cube/rate_card", AUTH_A), { env: ENV, fetch: up.fetch });

    const cubeCall = up.calls.find((c) => c.url.startsWith(ENV.cubeUrl));
    expect(cubeCall).toBeDefined();
    const query = new URL(cubeCall!.url).searchParams;
    expect(query.get("tenant_id")).toBe(`eq.${TENANT_A}`);
    expect(query.get("select")).toBe(BROKER_RESOURCES.rate_card.columns.join(","));
    expect(query.get("select")).not.toContain("*");
  });

  it("ignores a caller trying to choose the tenant, the table columns or the row count", async () => {
    const up = fakeUpstream(SIGNED_IN);
    const res = await handleCubeRequest(
      request(
        `/api/cube/rate_card?tenant_id=eq.${TENANT_B}&select=*&limit=100000&order=hourly_rate.desc`,
        AUTH_A
      ),
      { env: ENV, fetch: up.fetch }
    );

    const body = res.body as { rows: Array<Record<string, unknown>> };
    expect(body.rows.every((r) => r.tenant_id === TENANT_A)).toBe(true);

    const query = new URL(up.calls.find((c) => c.url.startsWith(ENV.cubeUrl))!.url).searchParams;
    // set(), not append() — a caller's tenant_id cannot ride along as a second value.
    expect(query.getAll("tenant_id")).toEqual([`eq.${TENANT_A}`]);
    expect(query.get("select")).not.toBe("*");
    expect(Number(query.get("limit"))).toBe(BROKER_RESOURCES.rate_card.maxLimit);
    expect(query.get("order")).toBe(BROKER_RESOURCES.rate_card.order);
  });

  it("refuses an X-Tenant-Id the caller is not a member of", async () => {
    const up = fakeUpstream(SIGNED_IN);
    const res = await handleCubeRequest(
      request("/api/cube/rate_card", { ...AUTH_A, "x-tenant-id": TENANT_B }),
      { env: ENV, fetch: up.fetch }
    );

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "tenant_unresolved" });
    expect(up.calls.every((c) => !c.url.startsWith(ENV.cubeUrl))).toBe(true);
  });

  it("refuses rather than guesses when a user belongs to several tenants", async () => {
    const multi = {
      users: { "token-m": "user-m" },
      memberships: {
        "user-m": [
          { tenant_id: TENANT_A, entitlements: ["legal.rates"], status: "active" },
          { tenant_id: TENANT_B, entitlements: ["legal.rates"], status: "active" },
        ],
      },
    };

    const bare = fakeUpstream(multi);
    const ambiguous = await handleCubeRequest(
      request("/api/cube/rate_card", { Authorization: "Bearer token-m" }),
      { env: ENV, fetch: bare.fetch }
    );
    expect(ambiguous.status).toBe(403);
    expect(ambiguous.body).toEqual({ error: "tenant_ambiguous" });

    const picked = fakeUpstream(multi);
    const chosen = await handleCubeRequest(
      request("/api/cube/rate_card", { Authorization: "Bearer token-m", "x-tenant-id": TENANT_B }),
      { env: ENV, fetch: picked.fetch }
    );
    expect(chosen.status).toBe(200);
    const body = chosen.body as { rows: Array<Record<string, unknown>> };
    expect(body.rows.map((r) => r.id)).toEqual(["r3"]);
  });

  it("drops a foreign row even if the Cube hands one back", async () => {
    // Belt and braces: simulate an upstream that ignores the predicate.
    const up = fakeUpstream(SIGNED_IN);
    const leaky = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith(ENV.cubeUrl)) return new Response(JSON.stringify(RATE_ROWS), { status: 200 });
      return up.fetch(input, init);
    }) as unknown as typeof fetch;

    const res = await handleCubeRequest(request("/api/cube/rate_card", AUTH_A), {
      env: ENV,
      fetch: leaky,
    });

    const body = res.body as { rows: Array<Record<string, unknown>> };
    expect(body.rows.map((r) => r.id)).toEqual(["r1", "r2"]);
  });

  it("accepts a text[] entitlement column that arrives in Postgres array literal form", async () => {
    const up = fakeUpstream({
      users: { "token-p": "user-p" },
      memberships: {
        "user-p": [
          { tenant_id: TENANT_A, entitlements: '{legal.rates,legal.parties}' as unknown as string[], status: "active" },
        ],
      },
    });
    const res = await handleCubeRequest(
      request("/api/cube/rate_card", { Authorization: "Bearer token-p" }),
      { env: ENV, fetch: up.fetch }
    );
    expect(res.status).toBe(200);
  });
});

describe("(c) the Cube credential never leaves the server", () => {
  it("never appears in a successful response, in any form", async () => {
    const up = fakeUpstream(SIGNED_IN);
    const res = await handleCubeRequest(request("/api/cube/rate_card", AUTH_A), {
      env: ENV,
      fetch: up.fetch,
    });

    const serialized = JSON.stringify(res.body) + JSON.stringify(res.headers);
    expect(serialized).not.toContain(CUBE_SECRET);
    expect(serialized).not.toContain(ENV.cubeUrl);
    expect(serialized).not.toContain(ENV.masterAnonKey);
  });

  it("never appears in any refusal, and refusals carry no upstream detail", async () => {
    const cases = [
      { opts: SIGNED_IN, headers: {} as Record<string, string> },
      { opts: SIGNED_IN, headers: { Authorization: "Bearer forged" } },
      { opts: { users: { "token-x": "user-x" }, memberships: { "user-x": [] } }, headers: { Authorization: "Bearer token-x" } },
      { opts: { ...SIGNED_IN, cubeStatus: 400 }, headers: AUTH_A },
      { opts: { ...SIGNED_IN, cubeThrows: true }, headers: AUTH_A },
    ];

    for (const c of cases) {
      const up = fakeUpstream(c.opts);
      const res = await handleCubeRequest(request("/api/cube/rate_card", c.headers), {
        env: ENV,
        fetch: up.fetch,
      });
      const serialized = JSON.stringify(res.body) + JSON.stringify(res.headers);
      expect(serialized).not.toContain(CUBE_SECRET);
      expect(serialized).not.toContain(ENV.cubeUrl);
      expect(serialized).not.toContain("ld_rate_card");
      expect(serialized).not.toContain("does not exist");
    }
  });

  it("sends the credential to the Cube and nowhere else", async () => {
    const up = fakeUpstream(SIGNED_IN);
    await handleCubeRequest(request("/api/cube/rate_card", AUTH_A), { env: ENV, fetch: up.fetch });

    for (const call of up.calls) {
      const carriesSecret = Object.values(call.headers).some((v) => String(v).includes(CUBE_SECRET));
      expect(carriesSecret, call.url).toBe(call.url.startsWith(ENV.cubeUrl));
    }
    // And the user's own token is never forwarded to the Cube.
    const cubeCall = up.calls.find((c) => c.url.startsWith(ENV.cubeUrl))!;
    expect(JSON.stringify(cubeCall.headers)).not.toContain("token-a");
  });

  it("returns a bare 502 when the Cube errors or is unreachable", async () => {
    for (const opts of [{ ...SIGNED_IN, cubeStatus: 500 }, { ...SIGNED_IN, cubeThrows: true }]) {
      const up = fakeUpstream(opts);
      const res = await handleCubeRequest(request("/api/cube/rate_card", AUTH_A), {
        env: ENV,
        fetch: up.fetch,
      });
      expect(res.status).toBe(502);
    }
  });

  it("marks every brokered response no-store", async () => {
    const up = fakeUpstream(SIGNED_IN);
    const res = await handleCubeRequest(request("/api/cube/rate_card", AUTH_A), {
      env: ENV,
      fetch: up.fetch,
    });
    expect(res.headers["cache-control"]).toBe("no-store");
  });
});

describe("query construction", () => {
  it("rejects a filter value carrying PostgREST operator syntax", () => {
    const resource = { ...BROKER_RESOURCES.rate_card, filters: { case: "case_id" } };
    const bad = buildCubeQuery(resource, TENANT_A, new URLSearchParams({ case: "x,tenant_id.neq.null" }));
    expect(bad).toEqual({ error: "bad_filter" });

    const good = buildCubeQuery(resource, TENANT_A, new URLSearchParams({ case: "ce111111-0000-4000-8000-00000000ce11" }));
    expect("error" in good).toBe(false);
  });

  it("reads the resource from the path and refuses anything nested", () => {
    expect(resourceNameFromPath("/api/cube/rate_card")).toBe("rate_card");
    expect(resourceNameFromPath("/api/cube/rate_card/")).toBe("rate_card");
    expect(resourceNameFromPath("/api/cube/a/b")).toBeNull();
    expect(resourceNameFromPath("/api/cube")).toBeNull();
    expect(resourceNameFromPath("/api/other")).toBeNull();
  });
});

describe("the allowlist itself", () => {
  it("gives every resource a tenant column, an entitlement and an explicit select", () => {
    for (const [name, resource] of Object.entries(BROKER_RESOURCES)) {
      expect(resource.tenantColumn, name).toBeTruthy();
      expect(resource.entitlement, name).toBeTruthy();
      expect(resource.columns.length, name).toBeGreaterThan(0);
      expect(resource.columns, name).not.toContain("*");
      expect(resource.columns, name).toContain(resource.tenantColumn);
      expect(resource.maxLimit, name).toBeGreaterThan(0);
    }
  });
});
