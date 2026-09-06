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

/**
 * D-BWVENDOR-1 fixtures. Vendors are TENANT-level, so the isolation control here
 * is a vendor in ANOTHER tenant rather than another book: if the broker ever
 * stopped scoping on tenant_id, PayRival would appear and these tests would fail.
 */
const VENDORS = [
  { tenant_id: TENANT, vendor_id: "v-payflow", name: "PayFlow Processing LLC", tier: "CRITICAL", amount: "$1.4M", done: 6, total: 8, status: "active" },
  { tenant_id: TENANT, vendor_id: "v-quill", name: "Quill Archiving", tier: "STANDARD", amount: "$120K", done: 4, total: 4, status: "active" },
  { tenant_id: OTHER_TENANT, vendor_id: "v-payrival", name: "PayRival (other tenant)", tier: "CRITICAL", amount: "$9.9M", done: 0, total: 8, status: "active" },
];

const VENDOR_CHECKLIST = [
  { tenant_id: TENANT, vendor_id: "v-payflow", title: "Annual risk review", status: "LAPSED", sealed: false, detail: "6d late", fact_key: "risk.annual", recorded_at: "2026-08-31" },
  { tenant_id: TENANT, vendor_id: "v-payflow", title: "SOC 2 report", status: "COMPLETE", sealed: true, detail: null, fact_key: "soc2", recorded_at: "2026-07-01" },
  { tenant_id: TENANT, vendor_id: "v-quill", title: "Insurance certificate", status: "COMPLETE", sealed: true, detail: null, fact_key: "ins", recorded_at: "2026-06-02" },
  { tenant_id: OTHER_TENANT, vendor_id: "v-payrival", title: "Should never be seen", status: "COMPLETE", sealed: true, detail: null, fact_key: "x", recorded_at: "2026-06-02" },
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
        table === "books"
          ? BOOKS
          : table === "evidence_decisions"
            ? DECISIONS
            : table === "bw_v_vendor_book"
              ? VENDORS
              : table === "bw_v_vendor_checklist"
                ? VENDOR_CHECKLIST
                : [];

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

  it("registers the nine lending resources", () => {
    expect(lending.map(([k]) => k).sort()).toEqual([
      "lending_attestations",
      "lending_books",
      "lending_changes",
      "lending_decision_log",
      "lending_decisions",
      "lending_interactions",
      "lending_vendor_checklist",
      "lending_vendors",
      "lending_view_registry",
    ]);
  });

  /**
   * The nav registry is scoped by TENANT but not by book, and that is the honest
   * shape rather than a gap: it carries no book column, because which surfaces an
   * operator sees is a per-book-owner fact, not a per-book one. Every resource
   * that holds EVIDENCE still carries both gates, and this test names the single
   * exception explicitly so a future one cannot be added quietly.
   */
  const TENANT_ONLY = new Set([
    "lending_view_registry",
    // D-BWVENDOR-1. A vendor is a counterparty the whole TENANT depends on and
    // carries no book column upstream. Adding one to satisfy the book gate would
    // be faking a scope the data does not have, so both are named here instead —
    // which is the point of this set: a tenant-only resource must be declared,
    // never merely omitted.
    "lending_vendors",
    "lending_vendor_checklist",
  ]);

  /**
   * The two vendor resources are PUBLIC views on the Cube (`bw_v_*`), not objects
   * in the `lending` schema like every other resource here. Named for the same
   * reason as TENANT_ONLY: the exception is declared so a third cannot appear
   * quietly, and the rule below still binds everything else.
   */
  const PUBLIC_SCHEMA = new Set(["lending_vendors", "lending_vendor_checklist"]);

  it("scopes every one of them by tenant, and every evidence resource by book too", () => {
    for (const [key, r] of lending) {
      expect(r.tenantColumn, key).toBe("tenant_id");
      if (!TENANT_ONLY.has(key)) expect(r.bookScope, key).toBeTruthy();
      expect(r.schema, key).toBe(PUBLIC_SCHEMA.has(key) ? null : "lending");
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

/**
 * D-BWVENDOR-1 — the TPRM resources.
 *
 * These are the first lending resources with NO book gate, so what has to be
 * proven is different: that dropping `bookScope` did not also drop the tenant
 * scope, and that the one filter they accept is the only one they accept.
 */
describe("the vendor resources (tenant-scoped, no book gate)", () => {
  it("returns this tenant's vendors and not another tenant's", async () => {
    const up = fakeUpstream(ONE_BOOK);
    const res = await handleCubeRequest(request("/api/cube/lending_vendors", AUTH), {
      env: ENV,
      fetch: up.fetch,
    });

    expect(res.status).toBe(200);
    const rows = (res.body as { rows: Array<{ name: string }> }).rows;
    expect(rows.map((r) => r.name)).toEqual(["PayFlow Processing LLC", "Quill Archiving"]);
    // The control: the other tenant's CRITICAL vendor is real and must not appear.
    expect(rows.some((r) => r.name.includes("PayRival"))).toBe(false);
  });

  it("scopes vendors on the tenant even though no book narrows them", async () => {
    const up = fakeUpstream(ONE_BOOK);
    await handleCubeRequest(request("/api/cube/lending_vendors", AUTH), { env: ENV, fetch: up.fetch });

    const cubeCall = up.calls.find((c) => c.url.includes("bw_v_vendor_book"));
    expect(cubeCall, "the Cube was never asked").toBeTruthy();
    expect(cubeCall!.url).toContain(`tenant_id=eq.${TENANT}`);
    // No book narrowing is sent, and none should be: these rows carry no book.
    expect(cubeCall!.url).not.toContain("book_id");
  });

  it("accepts the vendor filter on the checklist and narrows to that vendor", async () => {
    const up = fakeUpstream(ONE_BOOK);
    const res = await handleCubeRequest(
      request("/api/cube/lending_vendor_checklist?vendor=v-payflow", AUTH),
      { env: ENV, fetch: up.fetch }
    );

    expect(res.status).toBe(200);
    const rows = (res.body as { rows: Array<{ title: string }> }).rows;
    expect(rows.map((r) => r.title)).toEqual(["Annual risk review", "SOC 2 report"]);
    const cubeCall = up.calls.find((c) => c.url.includes("bw_v_vendor_checklist"));
    expect(cubeCall!.url).toContain("vendor_id=eq.v-payflow");
  });

  /**
   * The dispatch asked for "rejects any other filter name", expecting a refusal.
   * The broker does something stronger and this test asserts the real property:
   * buildCubeQuery iterates the RESOURCE's allowlist and pulls values out of the
   * caller's query string by name. A parameter the allowlist does not name is
   * never read at all, so it cannot contribute a key, a column, an operator or a
   * value. A 400 would be a weaker guarantee than never looking.
   */
  it("lets no filter name but vendor reach the query, and cannot be used to widen the tenant", async () => {
    const up = fakeUpstream(ONE_BOOK);
    const res = await handleCubeRequest(
      request(
        `/api/cube/lending_vendor_checklist?vendor=v-payflow&tenant_id=eq.${OTHER_TENANT}&select=*&order=title.desc`,
        AUTH
      ),
      { env: ENV, fetch: up.fetch }
    );

    expect(res.status).toBe(200);

    const cubeCall = up.calls.find((c) => c.url.includes("bw_v_vendor_checklist"));
    expect(cubeCall, "the Cube was never asked").toBeTruthy();
    const sent = new URL(cubeCall!.url).searchParams;

    // The server's tenant stands; the caller's attempt to redirect it is inert.
    expect(sent.get("tenant_id")).toBe(`eq.${TENANT}`);
    // select and order are fixed server-side from the resource, not the caller.
    expect(sent.get("select")).toBe(
      "tenant_id,vendor_id,title,status,sealed,detail,fact_key,recorded_at"
    );
    expect(sent.get("order")).toBe("recorded_at.asc");
    // The one allowlisted narrowing did apply.
    expect(sent.get("vendor_id")).toBe("eq.v-payflow");

    // And the rows are this tenant's, so nothing widened in the answer either.
    const rows = (res.body as { rows: Array<{ title: string }> }).rows;
    expect(rows.every((r) => r.title !== "Should never be seen")).toBe(true);
  });

  it("refuses both vendor resources to a caller without the lending entitlement", async () => {
    for (const resource of ["lending_vendors", "lending_vendor_checklist"]) {
      const up = fakeUpstream({ ...ONE_BOOK, entitlements: ["legal.rates"] });
      const res = await handleCubeRequest(request(`/api/cube/${resource}`, AUTH), {
        env: ENV,
        fetch: up.fetch,
      });

      // 403 not_entitled, not 404 — the dispatch guessed 404; this is what the
      // handler actually does, and it is the same answer every other lending
      // resource gives, which is the property worth holding.
      expect(res.status, resource).toBe(403);
      expect(res.body, resource).toEqual({ error: "not_entitled" });
      expect(up.calls.some((c) => c.url.startsWith(ENV.cubeUrl)), resource).toBe(false);
    }
  });
});
