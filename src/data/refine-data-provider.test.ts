import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The data provider adds a SHAPE on top of the broker client, not a door. So
 * these tests stub `fetch` — the one thing underneath both — and let the real
 * `brokerGet` / `brokerPost` / `listVendors` run. That is what makes the
 * "zero row difference" test below mean something: both sides read the same
 * bytes through the same client, and only the mapping differs.
 */

let token: string | null = "master-access-token";

vi.mock("@/config", () => ({
  getConfig: () => ({ data: { mode: "cube-broker", broker: {} } }),
}));

vi.mock("./lawdog-auth", () => ({
  getAccessToken: async () => token,
}));

const { brokerDataProvider, resetUnsupportedReports } = await import("./refine-data-provider");
const { listVendors } = await import("./lending-broker");
const { BrokerError } = await import("./cube-broker");

const VENDORS = [
  { tenant_id: "t-1", vendor_id: "v-1", name: "PayFlow Processing LLC", tier: "CRITICAL", amount: "$1.4M", done: 2, total: 8, status: "active" },
  { tenant_id: "t-1", vendor_id: "v-2", name: "Quill Archiving", tier: "HIGH", amount: "", done: 8, total: 8, status: "active" },
  { tenant_id: "t-1", vendor_id: "v-3", name: "Northgate Collections", tier: "CRITICAL", amount: "$310K", done: 5, total: 8, status: "review" },
  { tenant_id: "t-1", vendor_id: "v-4", name: "Ledgerline", tier: "LOW", amount: null, done: 0, total: 0, status: null },
];

interface Reply {
  status?: number;
  body: unknown;
}

let reply: (url: string, init?: RequestInit) => Reply;
let fetchMock: ReturnType<typeof vi.fn>;
let warn: ReturnType<typeof vi.spyOn>;

const rowsReply = (rows: unknown[]): Reply => ({ body: { resource: "x", tenant: "t-1", rows } });

beforeEach(() => {
  token = "master-access-token";
  resetUnsupportedReports();
  reply = () => rowsReply(VENDORS);
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const r = reply(String(url), init);
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  warn.mockRestore();
});

const VENDOR_META = { resource: "lending_vendors", idColumn: "vendor_id" };
const ALL = { mode: "off" as const };
const urlOf = (call = 0) => String((fetchMock.mock.calls[call] as unknown[])[0]);

describe("getList reads through the broker", () => {
  it("returns exactly the rows listVendors returns — zero row difference", async () => {
    const viaProvider = await brokerDataProvider.getList({ resource: "vendors", meta: VENDOR_META, pagination: ALL });
    const viaLegacy = await listVendors();

    expect(viaProvider.total).toBe(viaLegacy.length);

    // Same identity, same order, and every field the panel prints agrees.
    const project = (r: Record<string, unknown>) => ({
      id: String(r.id),
      name: r.name,
      tier: r.tier ?? null,
      amount: r.amount === "" || r.amount == null ? null : r.amount,
      done: Number(r.done),
      total: Number(r.total),
      status: r.status ?? null,
    });
    expect(viaProvider.data.map(project)).toEqual(
      viaLegacy.map((v) => ({ id: v.id, name: v.name, tier: v.tier, amount: v.amount, done: v.done, total: v.total, status: v.status }))
    );
  });

  it("knocks on the broker resource meta names, same-origin, with the session and nothing else", async () => {
    await brokerDataProvider.getList({ resource: "vendors", meta: VENDOR_META, pagination: ALL });

    expect(urlOf()).toBe("/api/cube/lending_vendors");
    const init = (fetchMock.mock.calls[0] as unknown[])[1] as RequestInit;
    expect(Object.keys(init.headers as Record<string, string>)).toEqual(["Authorization"]);
  });

  it("sends the selected book as the broker's own narrowing", async () => {
    await brokerDataProvider.getList({ resource: "decisions", meta: { resource: "lending_decisions", book_id: "b-1" }, pagination: ALL });
    expect(urlOf()).toBe("/api/cube/lending_decisions?book=b-1");
  });

  it("sends a filter the broker is declared to honour, and does not report it", async () => {
    await brokerDataProvider.getList({
      resource: "vendor_checklist",
      meta: { resource: "lending_vendor_checklist", brokerFilters: { vendor_id: "vendor" } },
      filters: [{ field: "vendor_id", operator: "eq", value: "v-1" }],
      pagination: ALL,
    });
    expect(urlOf()).toBe("/api/cube/lending_vendor_checklist?vendor=v-1");
    expect(warn).not.toHaveBeenCalled();
  });

  it("applies a filter the broker does not take to the returned rows, and says so — once", async () => {
    const args = {
      resource: "vendors",
      meta: VENDOR_META,
      filters: [{ field: "tier", operator: "eq" as const, value: "CRITICAL" }],
      pagination: ALL,
    };
    const first = await brokerDataProvider.getList(args);
    await brokerDataProvider.getList(args);

    // Not sent upstream: the broker would have ignored it and the table would
    // have looked filtered while showing everything.
    expect(urlOf()).toBe("/api/cube/lending_vendors");
    expect(first.data.map((r) => r.id)).toEqual(["v-1", "v-3"]);
    expect(first.total).toBe(2);

    const reports = warn.mock.calls.filter((c: unknown[]) => c[0] === "[data] unsupported_filter");
    expect(reports).toHaveLength(1);
    expect(reports[0][1]).toEqual({ resource: "lending_vendors", detail: "tier" });
    // The VALUE is never logged.
    expect(JSON.stringify(warn.mock.calls)).not.toContain("CRITICAL");
  });

  it("sorts client-side and reports the sorter", async () => {
    const res = await brokerDataProvider.getList({
      resource: "vendors",
      meta: VENDOR_META,
      sorters: [{ field: "done", order: "desc" }],
      pagination: ALL,
    });
    expect(res.data.map((r) => r.id)).toEqual(["v-2", "v-3", "v-1", "v-4"]);
    expect(warn.mock.calls.some((c: unknown[]) => c[0] === "[data] unsupported_sorter")).toBe(true);
  });

  it("pages over the filtered set and reports the filtered total", async () => {
    const res = await brokerDataProvider.getList({
      resource: "vendors",
      meta: VENDOR_META,
      pagination: { currentPage: 2, pageSize: 3 },
    });
    expect(res.data.map((r) => r.id)).toEqual(["v-4"]);
    expect(res.total).toBe(4);
  });

  it("returns a refusal as an empty answer carrying the code, not as a thrown error", async () => {
    for (const code of ["not_entitled", "tenant_unresolved", "tenant_ambiguous"]) {
      reply = () => ({ status: 403, body: { error: code } });
      const res = await brokerDataProvider.getList({ resource: "vendors", meta: VENDOR_META });
      expect(res).toEqual({ data: [], total: 0, meta: { refused: code } });
    }
  });

  it("still throws on a failure that is not a refusal", async () => {
    reply = () => ({ status: 502, body: { error: "upstream_error" } });
    await expect(brokerDataProvider.getList({ resource: "vendors", meta: VENDOR_META })).rejects.toMatchObject({ code: "upstream_error" });

    token = null;
    await expect(brokerDataProvider.getList({ resource: "vendors", meta: VENDOR_META })).rejects.toMatchObject({ code: "not_authenticated" });
  });
});

describe("getOne / getMany", () => {
  it("asks for one row by id and synthesises the id the view lacks", async () => {
    reply = () => rowsReply([VENDORS[0]]);
    const res = await brokerDataProvider.getOne({ resource: "vendors", id: "v-1", meta: VENDOR_META });
    expect(urlOf()).toBe("/api/cube/lending_vendors?id=v-1");
    expect(res.data).toMatchObject({ id: "v-1", name: "PayFlow Processing LLC" });
  });

  it("rejects with not_found when the broker returns no row", async () => {
    reply = () => rowsReply([]);
    await expect(brokerDataProvider.getOne({ resource: "vendors", id: "v-9", meta: VENDOR_META })).rejects.toMatchObject({ code: "not_found" });
  });

  it("asks for several rows with ids, and asks for nothing when there are none", async () => {
    reply = () => rowsReply(VENDORS.slice(0, 2));
    const res = await brokerDataProvider.getMany!({ resource: "vendors", ids: ["v-1", "v-2"], meta: VENDOR_META });
    expect(urlOf()).toBe("/api/cube/lending_vendors?ids=v-1%2Cv-2");
    expect(res.data.map((r) => r.id)).toEqual(["v-1", "v-2"]);

    fetchMock.mockClear();
    expect(await brokerDataProvider.getMany!({ resource: "vendors", ids: [], meta: VENDOR_META })).toEqual({ data: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("writes are pessimistic and go through brokerPost", () => {
  const STEP_META = {
    resource: "lending_vendor_checklist",
    key: { vendor_id: "862552ac-c4a1-45ae-8a3e-068c9a9ecdda", fact_key: "subcontractor_disclosure" },
  };

  it("posts the verb, the row address and the changed fields — and resolves with the server's row", async () => {
    reply = () => ({
      body: { ok: true, change_id: "chg-1", row: { tenant_id: "t-1", vendor_id: STEP_META.key.vendor_id, fact_key: "subcontractor_disclosure", status: "IN PROGRESS" } },
    });

    const res = await brokerDataProvider.update({
      resource: "vendor_checklist",
      id: "862552ac-c4a1-45ae-8a3e-068c9a9ecdda:3",
      variables: { status: "IN PROGRESS", detail: undefined },
      meta: STEP_META,
    });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/cube/lending_vendor_checklist");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ action: "update", id: STEP_META.key, values: { status: "IN PROGRESS" } });
    // No tenant, no actor, no table: the server derives all three.
    expect(String(init.body)).not.toMatch(/"(tenant|tenant_id|actor|table)"\s*:/);

    expect(res.data).toMatchObject({ id: "862552ac-c4a1-45ae-8a3e-068c9a9ecdda:3", status: "IN PROGRESS" });
  });

  it("rejects with the wall's code when the write is refused, and returns nothing to paint", async () => {
    reply = () => ({ status: 403, body: { ok: false, error: "role_required", change_id: "chg-2" } });

    const attempt = brokerDataProvider.update({ resource: "vendor_checklist", id: "x", variables: { status: "COMPLETE" }, meta: STEP_META });
    await expect(attempt).rejects.toBeInstanceOf(BrokerError);
    await expect(attempt).rejects.toMatchObject({ code: "role_required" });
  });

  it("treats a 200 without ok:true as a bad payload, not as success", async () => {
    reply = () => ({ body: { row: { status: "COMPLETE" } } });
    await expect(
      brokerDataProvider.update({ resource: "vendor_checklist", id: "x", variables: { status: "COMPLETE" }, meta: STEP_META })
    ).rejects.toMatchObject({ code: "bad_payload" });
  });

  it("has no free-form door", async () => {
    await expect(brokerDataProvider.custom!({ url: "/api/cube/anything", method: "get" })).rejects.toMatchObject({ code: "unsupported" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
