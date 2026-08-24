import { beforeEach, describe, expect, it, vi } from "vitest";
import { readJsonBody } from "../whereweare/adapter.js";
import { handleCubeRequest } from "./handler.js";
import { headerReader, absoluteUrl } from "../whereweare/adapter.js";
import type { BrokerEnv } from "./env.js";

/**
 * THE TEST D-MSDOOR-2 WAS MISSING.
 *
 * server/broker/handler.ts was well covered and correct the whole time. What had
 * ZERO coverage was the Vercel entrypoint that feeds it — api/cube/[...path].ts —
 * and that is where the defect lived: it assumed a Web `Request`, so on the Node
 * runtime it handed the handler a header bag with no `.get` and a bare path that
 * `new URL()` cannot parse, then returned a `Response` nobody was listening for.
 * The route answered NOTHING. Unauthenticated `curl` sat for 30s with no status,
 * and the Books pane spun forever because its fetch never settled.
 *
 * These tests pin the CONTRACT BETWEEN the platform and the handler, under both
 * calling conventions, so the assumption cannot come back.
 */

const env: BrokerEnv = {
  masterUrl: "https://master.example",
  masterAnonKey: "anon",
  cubeUrl: "https://cube.example",
  cubeKey: "cube-key",
  cubeSchema: "lending",
  membershipTable: "shell_tenant_members",
};

/**
 * THE ENTRYPOINT ITSELF, invoked the way the platform invokes it.
 *
 * This is the suite that fails against the pre-fix file. Exercising the handler
 * through the adapter proves the handler is fine — which it always was. The
 * defect lived in api/cube/[...path].ts, so the test has to invoke THAT.
 */
describe("api/cube/[...path].ts — invoked as the Node runtime invokes it", () => {
  beforeEach(() => {
    process.env.MASTER_URL = env.masterUrl;
    process.env.MASTER_ANON_KEY = env.masterAnonKey;
    process.env.CUBE_URL = env.cubeUrl;
    process.env.CUBE_BROKER_KEY = env.cubeKey;
  });

  /** A Node ServerResponse double: records what the route actually sent. */
  function nodeResponse() {
    const sent: {
      status?: number;
      body?: string;
      headers: Record<string, string>;
      ended: boolean;
    } = { headers: {}, ended: false };
    return {
      res: {
        set statusCode(v: number) {
          sent.status = v;
        },
        get statusCode() {
          return sent.status ?? 0;
        },
        setHeader: (k: string, v: string) => {
          sent.headers[k] = v;
        },
        end: (body?: string) => {
          sent.ended = true;
          sent.body = body;
        },
      },
      sent,
    };
  }

  it("ANSWERS a Node-style anonymous request — it must not leave the socket open", async () => {
    const { default: route } = await import("../../api/cube/[...path].js");
    const { res, sent } = nodeResponse();

    await route(nodeStyleRequest(), res);

    // THE REGRESSION THAT MATTERS. The pre-fix route returned a `Response`
    // object and never called end(), so the request hung until the client gave
    // up — 30s of nothing, and a Books pane spinning forever.
    expect(sent.ended).toBe(true);
    expect(sent.status).toBe(401);
    expect(JSON.parse(sent.body ?? "{}")).toEqual({ error: "not_authenticated" });
  });

  it("does not throw on a Node header bag that has no .get", async () => {
    const { default: route } = await import("../../api/cube/[...path].js");
    const { res } = nodeResponse();
    // Pre-fix this raised `headers.get is not a function` — the
    // FUNCTION_INVOCATION_FAILED seen on the sibling hosts.
    await expect(route(nodeStyleRequest(), res)).resolves.not.toThrow();
  });

  it("still returns a Response when the platform expects one", async () => {
    const { default: route } = await import("../../api/cube/[...path].js");
    const request = new Request("https://x.example/api/cube/lending_books");
    const result = await route(request);
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(401);
  });

  it("answers broker_misconfigured rather than crashing when env is absent", async () => {
    delete process.env.CUBE_BROKER_KEY;
    const { default: route } = await import("../../api/cube/[...path].js");
    const { res, sent } = nodeResponse();
    await route(nodeStyleRequest(), res);
    expect(sent.ended).toBe(true);
    expect(sent.status).toBe(500);
    expect(JSON.parse(sent.body ?? "{}")).toEqual({ error: "broker_misconfigured" });
  });
});

/** The shape the Vercel Node runtime actually hands a function. */
function nodeStyleRequest(overrides: Record<string, unknown> = {}) {
  return {
    method: "GET",
    // Node gives a PATH, not an absolute URL.
    url: "/api/cube/lending_books",
    // Node gives a PLAIN OBJECT. No `.get`. This is the crash.
    headers: { host: "lending-app.example" } as Record<string, string>,
    ...overrides,
  };
}

describe("the cube route feeds the handler correctly under BOTH conventions", () => {
  it("refuses an anonymous Node-style request instead of throwing", async () => {
    const req = nodeStyleRequest();
    const fetchSpy = vi.fn();

    const result = await handleCubeRequest(
      {
        method: req.method,
        url: absoluteUrl(req.url, "/api/cube/"),
        headers: headerReader(req.headers),
      },
      { env, fetch: fetchSpy as never }
    );

    expect(result.status).toBe(401);
    expect(result.body).toEqual({ error: "not_authenticated" });
    // Anonymous must not cost an upstream call.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("reads the bearer out of a Node plain-object header bag", async () => {
    const req = nodeStyleRequest({
      headers: { authorization: "Bearer real-token" },
    });
    // Master refuses the token; what matters is that we GOT here, i.e. the
    // bearer was found in a bag with no `.get`.
    const fetchSpy = vi.fn(async (_url: string, _init?: RequestInit) =>
      new Response("{}", { status: 401 })
    );

    const result = await handleCubeRequest(
      {
        method: req.method,
        url: absoluteUrl(req.url, "/api/cube/"),
        headers: headerReader(req.headers),
      },
      { env, fetch: fetchSpy as never }
    );

    expect(result.status).toBe(401);
    // It reached master — proof the token was extracted, not lost.
    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(String(fetchSpy.mock.calls[0][0])).toContain("/auth/v1/user");
  });

  it("resolves the resource name from a bare Node path", async () => {
    // The bug: `new URL("/api/cube/lending_books")` throws. Via the adapter it
    // parses, and the resource is still read out of the path correctly.
    const url = absoluteUrl("/api/cube/lending_books?limit=5", "/api/cube/");
    expect(() => new URL(url)).not.toThrow();
    expect(new URL(url).pathname).toBe("/api/cube/lending_books");
    expect(new URL(url).searchParams.get("limit")).toBe("5");
  });

  it("still answers an unknown resource with 404 rather than a hang", async () => {
    const result = await handleCubeRequest(
      {
        method: "GET",
        url: absoluteUrl("/api/cube/not_a_resource", "/api/cube/"),
        headers: headerReader({ authorization: "Bearer x" }),
      },
      { env, fetch: vi.fn() as never }
    );
    expect(result.status).toBe(404);
    expect(result.body).toEqual({ error: "unknown_resource" });
  });

  it("handles a Web Request exactly as before — the fix is additive", async () => {
    const request = new Request("https://lending-app.example/api/cube/lending_books");
    const result = await handleCubeRequest(
      {
        method: request.method,
        url: absoluteUrl(request.url, "/api/cube/"),
        headers: headerReader(request.headers),
      },
      { env, fetch: vi.fn() as never }
    );
    expect(result.status).toBe(401);
  });
});

describe("readJsonBody — the POST path under every convention", () => {
  it("uses .json() when the platform gives a Web Request", async () => {
    const req = new Request("https://x.example/api/cube/lending_decision_log", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "confirmed" }),
    });
    await expect(readJsonBody(req)).resolves.toEqual({ action: "confirmed" });
  });

  it("uses a pre-parsed Node object body", async () => {
    await expect(readJsonBody({ body: { action: "waived" } })).resolves.toEqual({
      action: "waived",
    });
  });

  it("parses a pre-parsed Node STRING body", async () => {
    await expect(readJsonBody({ body: '{"action":"waived"}' })).resolves.toEqual({
      action: "waived",
    });
  });

  it("drains an unread Node stream", async () => {
    const listeners: Record<string, (chunk?: unknown) => void> = {};
    const req = {
      on: (event: string, cb: (chunk?: unknown) => void) => {
        listeners[event] = cb;
      },
    };
    const promise = readJsonBody(req);
    listeners.data('{"action":');
    listeners.data('"confirmed"}');
    listeners.end();
    await expect(promise).resolves.toEqual({ action: "confirmed" });
  });

  it("throws on unparseable input, so the route's bad_body refusal still fires", async () => {
    await expect(readJsonBody({ body: "not json" })).rejects.toThrow();
    await expect(readJsonBody({})).rejects.toThrow();
  });
});
