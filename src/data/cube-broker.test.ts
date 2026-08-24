import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The client half only has to be trustworthy about one thing: it must carry the
 * user's master session to a same-origin path and nothing else. No key, no
 * project URL, no tenant it chose for itself.
 */

let token: string | null = "master-access-token";
let pinnedTenant: string | undefined;

vi.mock("@/config", () => ({
  getConfig: () => ({ data: { mode: "cube-broker", broker: { tenantId: pinnedTenant } } }),
}));

vi.mock("./lawdog-auth", () => ({
  getAccessToken: async () => token,
}));

const { brokerGet, listRateCardViaBroker, BrokerError, isBrokerMode } = await import("./cube-broker");

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  token = "master-access-token";
  pinnedTenant = undefined;
  fetchMock = vi.fn(async () =>
    new Response(JSON.stringify({ resource: "rate_card", tenant: "t-1", rows: [] }), { status: 200 })
  );
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("brokerGet", () => {
  it("refuses without a master session and issues no request", async () => {
    token = null;
    await expect(brokerGet("rate_card")).rejects.toBeInstanceOf(BrokerError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the master session to a same-origin broker path and nothing else", async () => {
    await brokerGet("rate_card");

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/cube/rate_card");
    // Same-origin, relative: the browser is never told where the Cube lives.
    expect(url.startsWith("http")).toBe(false);

    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer master-access-token");
    // No apikey: the broker holds the only credential the Cube will ever see.
    expect(Object.keys(headers)).toEqual(["Authorization"]);
  });

  it("sends X-Tenant-Id only when the profile pins one", async () => {
    pinnedTenant = "t-9";
    await brokerGet("rate_card");
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers["X-Tenant-Id"]).toBe("t-9");
  });

  it("surfaces the broker's refusal code and nothing it invented", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "tenant_unresolved" }), { status: 403 })
    );
    await expect(brokerGet("rate_card")).rejects.toMatchObject({ code: "tenant_unresolved" });
  });

  it("treats a non-JSON or shapeless success as a failure rather than empty data", async () => {
    fetchMock.mockResolvedValueOnce(new Response("not json", { status: 200 }));
    await expect(brokerGet("rate_card")).rejects.toMatchObject({ code: "bad_payload" });
  });
});

describe("listRateCardViaBroker", () => {
  it("maps brokered rows through the same mapper the native provider uses", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          resource: "rate_card",
          tenant: "t-1",
          // hourly_rate as a string is the driver variation the mapper exists to absorb.
          rows: [{ id: "r1", role: "partner", hourly_rate: "650", locale: "TX", basis: "standard" }],
        }),
        { status: 200 }
      )
    );

    const rates = await listRateCardViaBroker();
    expect(rates).toEqual([
      { id: "r1", role: "partner", hourlyRate: 650, locale: "TX", basis: "standard" },
    ]);
  });
});

describe("isBrokerMode", () => {
  it("is true only for the cube-broker profile", () => {
    expect(isBrokerMode()).toBe(true);
  });
});

/**
 * D-MSDOOR-2: THE PANE MUST BE ABLE TO FAIL.
 *
 * The broker route that hung is fixed, but the reason a hung route was able to
 * freeze the UI at all was here: `brokerGet` awaited a fetch with no ceiling, so
 * a request that never settled left every panel on "Loading…" forever with its
 * own error branch never reached. These pin the ceiling.
 */
describe("a request that never settles still fails visibly", () => {
  it("gives up with a timeout code instead of hanging forever", async () => {
    vi.useFakeTimers();
    // The exact production shape: a server that accepts the socket and never answers.
    fetchMock = vi.fn(
      (_input: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
          );
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const pending = brokerGet("rate_card");
    const assertion = expect(pending).rejects.toMatchObject({ code: "timeout" });
    await vi.advanceTimersByTimeAsync(20_000);
    await assertion;
    vi.useRealTimers();
  });

  it("passes an abort signal on every brokered read", async () => {
    await brokerGet("rate_card");
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("reports a network failure as a broker code, not a raw exception", async () => {
    fetchMock = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(brokerGet("rate_card")).rejects.toMatchObject({ code: "unreachable" });
  });
});
