/**
 * The inbox handler's job is to be honest, and these pin the two ways it could
 * stop being: letting an unauthenticated caller read anything, and letting a
 * broken source look like an empty one.
 */

import { describe, expect, it } from "vitest";
import { handleInboxRequest } from "./handler.js";
import type { InboxEnv } from "./env.js";

const env: InboxEnv = { masterUrl: "https://master.example", masterAnonKey: "anon-key" };

function req(overrides: Partial<{ method: string; auth: string | null }> = {}) {
  const auth = overrides.auth === undefined ? "Bearer good-token" : overrides.auth;
  return {
    method: overrides.method ?? "GET",
    url: "https://shell.example/api/inbox",
    headers: { get: (n: string) => (n.toLowerCase() === "authorization" ? auth : null) },
  };
}

/** A fetch that answers the user check, then serves per-relation fixtures. */
function fakeFetch(byRelation: Record<string, unknown>, opts: { user?: boolean } = {}) {
  const calls: string[] = [];
  const impl = (async (url: string) => {
    calls.push(url);
    if (url.includes("/auth/v1/user")) {
      return opts.user === false
        ? { ok: false, status: 401, json: async () => ({}) }
        : { ok: true, status: 200, json: async () => ({ id: "user-1" }) };
    }
    for (const [relation, body] of Object.entries(byRelation)) {
      if (url.includes(`/rest/v1/${relation}?`)) {
        if (body === "boom") return { ok: false, status: 403, json: async () => ({}) };
        return { ok: true, status: 200, json: async () => body };
      }
    }
    return { ok: true, status: 200, json: async () => [] };
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const deps = (f: typeof fetch) => ({ env, fetch: f, now: () => 1_700_000_000_000 });

describe("refusals come before any read", () => {
  it("refuses a caller with no bearer, and reads nothing", async () => {
    const { impl, calls } = fakeFetch({});
    const res = await handleInboxRequest(req({ auth: null }), deps(impl));
    expect(res.status).toBe(401);
    expect(calls).toHaveLength(0);
  });

  it("refuses when master rejects the token, and reads no data relation", async () => {
    const { impl, calls } = fakeFetch({}, { user: false });
    const res = await handleInboxRequest(req(), deps(impl));
    expect(res.status).toBe(401);
    expect(calls.every((c) => c.includes("/auth/v1/user"))).toBe(true);
  });

  it("refuses a non-GET — this surface is read-only", async () => {
    const { impl, calls } = fakeFetch({});
    const res = await handleInboxRequest(req({ method: "POST" }), deps(impl));
    expect(res.status).toBe(405);
    expect(calls).toHaveLength(0);
  });
});

describe("a broken source never looks like an empty one", () => {
  it("carries the failing source's code instead of returning zero rows silently", async () => {
    const { impl } = fakeFetch({ v_dispatch_program: "boom" });
    const res = await handleInboxRequest(req(), deps(impl));
    const body = res.body as any;
    expect(res.status).toBe(200);
    expect(body.queue.error).toBe("http_403");
    expect(body.queue.rows).toEqual([]);
  });

  it("one dead source does not blank the others", async () => {
    const { impl } = fakeFetch({
      v_dispatch_program: "boom",
      v_motherdesk_master_todo: [{ lane: "cos", title: "a todo", age_hours: 5 }],
    });
    const body = (await handleInboxRequest(req(), deps(impl))).body as any;
    expect(body.queue.error).toBe("http_403");
    expect(body.todo.error).toBeNull();
    expect(body.todo.rows).toHaveLength(1);
  });

  it("names an unparseable courier feed rather than showing an empty inbox", async () => {
    const { impl } = fakeFetch({
      v_artifact_current: [{ artifact_key: "lane-inbox-courier", source_code: "{not json" }],
    });
    const body = (await handleInboxRequest(req(), deps(impl))).body as any;
    expect(body.inbox.error).toContain("courier_feed_unparseable");
  });

  it("says the courier feed is missing when the artifact returns nothing", async () => {
    const { impl } = fakeFetch({ v_artifact_current: [] });
    const body = (await handleInboxRequest(req(), deps(impl))).body as any;
    expect(body.inbox.error).toContain("courier_feed_missing");
  });
});

describe("the board it builds", () => {
  it("merges parked work and open items into one stream, newest first", async () => {
    const { impl } = fakeFetch({
      v_artifact_current: [
        {
          artifact_key: "lane-inbox-courier",
          source_code: JSON.stringify({
            rows: [{ item: "parked thing", lane: "cos", parked_at: "2026-08-01T00:00:00Z", age_hours: 100 }],
          }),
        },
      ],
      open_items: [{ id: "1", title: "newer item", lane: "cwm", created_at: "2026-08-20T00:00:00Z" }],
    });
    const body = (await handleInboxRequest(req(), deps(impl))).body as any;
    expect(body.inbox.rows.map((r: any) => r.kind)).toEqual(["open_item", "parked"]);
  });

  it("attaches the blocker reason to the queue row it belongs to", async () => {
    const { impl } = fakeFetch({
      v_dispatch_program: [{ id: "row-1", status: "blocked", lane: "cos", title: "held" }],
      v_blockers: [{ id: "row-1", blocks_what: "waiting on a human" }],
    });
    const body = (await handleInboxRequest(req(), deps(impl))).body as any;
    expect(body.queue.rows[0].blocks_what).toBe("waiting on a human");
  });

  it("still returns the queue when the blocker read fails, and says the reasons are gone", async () => {
    const { impl } = fakeFetch({
      v_dispatch_program: [{ id: "row-1", status: "blocked", title: "held" }],
      v_blockers: "boom",
    });
    const body = (await handleInboxRequest(req(), deps(impl))).body as any;
    expect(body.queue.rows).toHaveLength(1);
    expect(body.queue.caveat).toContain("blocker reasons unavailable");
  });

  it("every section names the relation it read", async () => {
    const { impl } = fakeFetch({});
    const body = (await handleInboxRequest(req(), deps(impl))).body as any;
    for (const key of ["queue", "inbox", "todo", "health"]) {
      expect(body[key].source, key).toBeTruthy();
      expect(body[key].read_at, key).toBeTruthy();
    }
  });

  it("says out loud that the queue's prompt and result are out of reach", async () => {
    const { impl } = fakeFetch({});
    const body = (await handleInboxRequest(req(), deps(impl))).body as any;
    expect(body.queue.caveat).toContain("code_dispatch_queue");
  });

  it("asks the queue view for open work only — done and canceled never arrive", async () => {
    const { impl, calls } = fakeFetch({});
    await handleInboxRequest(req(), deps(impl));
    const queueCall = calls.find((c) => c.includes("v_dispatch_program"));
    expect(queueCall).toContain("status=not.in.(done,canceled)");
  });

  it("sends the CALLER's token to every relation, never a server credential", async () => {
    const seen: string[] = [];
    const impl = (async (url: string, init?: RequestInit) => {
      seen.push(String((init?.headers as Record<string, string>)?.Authorization));
      if (url.includes("/auth/v1/user")) return { ok: true, status: 200, json: async () => ({ id: "u" }) };
      return { ok: true, status: 200, json: async () => [] };
    }) as unknown as typeof fetch;
    await handleInboxRequest(req(), deps(impl));
    expect(seen.every((h) => h === "Bearer good-token")).toBe(true);
  });
});
