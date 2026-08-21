import { describe, expect, it } from "vitest";
import { handleCubeRequest } from "./handler";
import { BROKER_RESOURCES } from "./resources";
import type { BrokerEnv } from "./env";

/**
 * The lending surface's own gate: THE BOOK.
 *
 * Tenant scoping is already covered by handler.test.ts. What is new here is
 * that a lending tenant can hold more than one book and access is granted a
 * book at a time — so the fake upstream honours BOTH `eq.` and `in.` filters.
 * If the broker ever stopped narrowing to the entitled books, the fake would
 * hand back the other book's rows and these tests would fail. A fake that only
 * ever returned one book's rows would prove nothing.
 */

const CUBE_SECRET = "cube-broker-key-must-never-leak";

const ENV: BrokerEnv = {
  masterUrl: "https://master.example",
  masterAnonKey: "master-anon-key",
  cubeUrl: "https://cube.example",
  cubeKey: CUBE_SECRET,
  cubeSchema: null,
  membershipTable: "shell_tenant_members",
};

const TENANT = "6f361690-9876-43e8-b5bd-9bba6c44ae68";
const OTHER_TENANT = "3018ac90-5d2d-45b4-87b4-a34f1b66d1e8";

const BOOK_MINE = "4a7b0983-93ee-4d6d-bbf1-c7551c1f0a1c";
const BOOK_SIBLING = "bbbbbbbb-0000-4000-8000-00000000bbbb";
const BOOK_OTHER_TENANT = "052ab1b0-6935-4685-9477-c64c015d86fb";

/** Two books in the caller's OWN tenant, and one in another tenant entirely. */
const BOOKS = [
  { id: BOOK_MINE, tenant_id: TENANT, slug: "specimen-first-light", display_name: "First Light", tribe_label: null, is_specimen: true, status: "specimen" },
  { id: BOOK_SIBLING, tenant_id: TENANT, slug: "sibling-book", display_name: "Sibling", tribe_label: null, is_specimen: false, status: "active" },
  { id: BOOK_OTHER_TENANT, tenant_id: OTHER_TENANT, slug: "specimen-second-lender", display_name: "Second Lender", tribe_label: null, is_specimen: true, status: "active" },
];

const DECISIONS = [
  { id: "d1", tenant_id: TENANT, book_id: BOOK_MINE, decision_ref: "D-1", outcome: "declined" },
  { id: "d2", tenant_id: TENANT, book_id: BOOK_SIBLING, decision_ref: "D-2", outcome: "approved" },
  { id: "d3", tenant_id: OTHER_TENANT, book_id: BOOK_OTHER_TENANT, decision_ref: "D-3", outcome: "approved" },
];

interface FakeOptions {
  /** token → master user id */
  users?: Record<string, string>;
  /** user id → email master reports for them */
  emails?: Record<string, string>;
  /** email → book slugs fn_lending_entitlement returns */
  entitledBooks?: Record<string, string[]>;
  entitlements?: string[];
  rpcStatus?: number;
}

function fakeUpstream(opts: FakeOptions) {
  const calls: Array<{ url: string; headers: Record<string, string>; body?: string }> = [];

  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const headers = Object.fromEntries(
      Object.entries((init?.headers ?? {}) as Record<string, string>)
    );
    calls.push({ url, headers, body: init?.body ? String(init.body) : undefined });
    const bearer = (headers.Authorization ?? "").replace(/^Bearer\s+/, "");

    if (url.startsWith(`${ENV.masterUrl}/auth/v1/user`)) {
      const id = opts.users?.[bearer];
      if (!id) return new Response(JSON.stringify({ msg: "invalid" }), { status: 401 });
      return new Response(JSON.stringify({ id, email: opts.emails?.[id] ?? null }), { status: 200 });
    }

    if (url.startsWith(`${ENV.masterUrl}/rest/v1/rpc/fn_lending_entitlement`)) {
      if (opts.rpcStatus && opts.rpcStatus >= 400) {
        return new Response(JSON.stringify({ message: "denied" }), { status: opts.rpcStatus });
      }
      const asked = JSON.parse(String(init?.body ?? "{}")) as { p_email?: string };
      const slugs = opts.entitledBooks?.[asked.p_email ?? ""] ?? [];
      return new Response(
        JSON.stringify({ email: asked.p_email, books: slugs.map((s) => ({ book_slug: s, role: "admin" })) }),
        { status: 200 }
      );
    }

    if (url.startsWith(`${ENV.masterUrl}/rest/v1/${ENV.membershipTable}`)) {
      const id = opts.users?.[bearer];
      const rows = id
        ? [{ tenant_id: TENANT, entitlements: opts.entitlements ?? ["*"], status: "active" }]
        : [];
      return new Response(JSON.stringify(rows), { status: 200 });
    }

    if (url.startsWith(`${ENV.cubeUrl}/rest/v1/`)) {
      const parsed = new URL(url);
      const table = parsed.pathname.split("/").pop();
      let rows: Array<Record<string, unknown>> =
        table === "books" ? BOOKS : table === "evidence_decisions" ? DECISIONS : [];

      for (const [key, value] of parsed.searchParams.entries()) {
        if (key === "select" || key === "order" || key === "limit") continue;
        const eq = /^eq\.(.*)$/.exec(value);
        if (eq) {
          rows = rows.filter((r) => String(r[key]) === eq[1]);
          continue;
        }
        const inList = /^in\.\((.*)\)$/.exec(value);
        if (inList) {
          const allowed = new Set(inList[1].split(",").filter(Boolean));
          rows = rows.filter((r) => allowed.has(String(r[key])));
        }
      }
      return new Response(JSON.stringify(rows), { status: 200 });
    }

    throw new Error(`unexpected upstream call: ${url}`);
  }) as unknown as typeof fetch;

  return { fetch: fetchImpl, calls };
}

function request(path: string, headers: Record<string, string> = {}) {
  return {
    method: "GET",
    url: `https://shell.example${path}`,
    headers: { get: (n: string) => headers[n] ?? headers[n.toLowerCase()] ?? null },
  };
}

const AUTH = { Authorization: "Bearer token-a" };

const ONE_BOOK: FakeOptions = {
  users: { "token-a": "user-a" },
  emails: { "user-a": "someone@example.test" },
  entitledBooks: { "someone@example.test": ["specimen-first-light"] },
};

describe("every lending resource declares both gates", () => {
  const lending = Object.entries(BROKER_RESOURCES).filter(([k]) => k.startsWith("lending_"));

  it("registers the five lending resources", () => {
    expect(lending.map(([k]) => k).sort()).toEqual([
      "lending_attestations",
      "lending_books",
      "lending_changes",
      "lending_decisions",
      "lending_interactions",
    ]);
  });

  it("scopes every one of them by tenant AND by book", () => {
    for (const [key, r] of lending) {
      expect(r.tenantColumn, key).toBe("tenant_id");
      expect(r.bookScope, key).toBeTruthy();
      expect(r.schema, key).toBe("lending");
      // No `*`: a column added upstream must be opted into here.
      expect(r.columns.includes("*"), key).toBe(false);
      expect(r.columns.includes("tenant_id"), key).toBe(true);
    }
  });

  it("never lets a caller choose a column, a table or an operator", () => {
    for (const [key, r] of lending) {
      for (const column of Object.values(r.filters)) {
        expect(r.columns.includes(column), `${key} filters on an unselected column`).toBe(true);
      }
    }
  });
});

describe("the book gate", () => {
  it("returns only the entitled book, not the sibling book in the same tenant", async () => {
    const up = fakeUpstream(ONE_BOOK);
    const res = await handleCubeRequest(request("/api/cube/lending_books", AUTH), {
      env: ENV,
      fetch: up.fetch,
    });

    expect(res.status).toBe(200);
    const rows = (res.body as { rows: Array<{ slug: string }> }).rows;
    expect(rows.map((r) => r.slug)).toEqual(["specimen-first-light"]);
  });

  it("narrows evidence to the entitled book, even though the sibling shares the tenant", async () => {
    const up = fakeUpstream(ONE_BOOK);
    const res = await handleCubeRequest(request("/api/cube/lending_decisions", AUTH), {
      env: ENV,
      fetch: up.fetch,
    });

    expect(res.status).toBe(200);
    const rows = (res.body as { rows: Array<{ decision_ref: string }> }).rows;
    expect(rows.map((r) => r.decision_ref)).toEqual(["D-1"]);
  });

  it("refuses when master says the caller holds no book at all", async () => {
    const up = fakeUpstream({ ...ONE_BOOK, entitledBooks: { "someone@example.test": [] } });
    const res = await handleCubeRequest(request("/api/cube/lending_decisions", AUTH), {
      env: ENV,
      fetch: up.fetch,
    });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "not_entitled" });
    // The entitlement register said no, so the Cube is never asked anything.
    expect(up.calls.some((c) => c.url.startsWith(ENV.cubeUrl))).toBe(false);
  });

  it("refuses a book the caller is entitled to that lives in another tenant", async () => {
    // The isolation control: this slug is real, and it is not in this tenant.
    const up = fakeUpstream({
      ...ONE_BOOK,
      entitledBooks: { "someone@example.test": ["specimen-second-lender"] },
    });
    const res = await handleCubeRequest(request("/api/cube/lending_decisions", AUTH), {
      env: ENV,
      fetch: up.fetch,
    });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "not_entitled" });
  });

  it("refuses when master reports no email for the session", async () => {
    const up = fakeUpstream({ ...ONE_BOOK, emails: {} });
    const res = await handleCubeRequest(request("/api/cube/lending_books", AUTH), {
      env: ENV,
      fetch: up.fetch,
    });
    expect(res.status).toBe(403);
  });

  it("refuses when the entitlement register itself is unreachable — fail closed", async () => {
    const up = fakeUpstream({ ...ONE_BOOK, rpcStatus: 500 });
    const res = await handleCubeRequest(request("/api/cube/lending_books", AUTH), {
      env: ENV,
      fetch: up.fetch,
    });
    expect(res.status).toBe(403);
  });

  it("asks the register with the email MASTER verified, never one from the request", async () => {
    const up = fakeUpstream(ONE_BOOK);
    await handleCubeRequest(
      // A caller trying to smuggle another identity in through the query string.
      request("/api/cube/lending_books?p_email=someone.else@example.test&email=x", AUTH),
      { env: ENV, fetch: up.fetch }
    );

    const rpc = up.calls.find((c) => c.url.includes("/rpc/fn_lending_entitlement"));
    expect(rpc).toBeDefined();
    expect(JSON.parse(rpc!.body ?? "{}")).toEqual({ p_email: "someone@example.test" });
  });

  it("carries the caller's own token to the register, not a server credential", async () => {
    const up = fakeUpstream(ONE_BOOK);
    await handleCubeRequest(request("/api/cube/lending_books", AUTH), { env: ENV, fetch: up.fetch });

    const rpc = up.calls.find((c) => c.url.includes("/rpc/fn_lending_entitlement"))!;
    expect(rpc.headers.Authorization).toBe("Bearer token-a");
    expect(JSON.stringify(rpc)).not.toContain(CUBE_SECRET);
  });

  it("still refuses a caller whose tenancy row lacks the entitlement, before any book lookup", async () => {
    const up = fakeUpstream({ ...ONE_BOOK, entitlements: ["legal.rates"] });
    const res = await handleCubeRequest(request("/api/cube/lending_decisions", AUTH), {
      env: ENV,
      fetch: up.fetch,
    });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "not_entitled" });
    expect(up.calls.some((c) => c.url.includes("/rpc/fn_lending_entitlement"))).toBe(false);
  });

  it("never leaks the Cube credential in any response", async () => {
    const up = fakeUpstream(ONE_BOOK);
    for (const path of [
      "/api/cube/lending_books",
      "/api/cube/lending_decisions",
      "/api/cube/lending_nope",
    ]) {
      const res = await handleCubeRequest(request(path, AUTH), { env: ENV, fetch: up.fetch });
      expect(JSON.stringify(res.body)).not.toContain(CUBE_SECRET);
    }
  });

  it("reaches the lending schema, not the default one", async () => {
    const up = fakeUpstream(ONE_BOOK);
    await handleCubeRequest(request("/api/cube/lending_decisions", AUTH), { env: ENV, fetch: up.fetch });

    const cubeCalls = up.calls.filter((c) => c.url.startsWith(ENV.cubeUrl));
    expect(cubeCalls.length).toBeGreaterThan(0);
    for (const c of cubeCalls) expect(c.headers["Accept-Profile"]).toBe("lending");
  });
});
