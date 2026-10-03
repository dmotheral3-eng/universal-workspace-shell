import { describe, expect, it } from "vitest";
import { handleCubeRequest } from "./handler";
import type { BrokerEnv } from "./env";

/**
 * `whoami` answers from master alone. The two things worth proving are that it
 * can only ever describe the CALLER, and that it never spends the Cube
 * credential to do it.
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

const USERS: Record<string, string> = { "token-a": "user-a", "token-two": "user-two", "token-none": "user-none" };
const MEMBERSHIPS: Record<string, Array<{ tenant_id: string; entitlements: string[]; status: string }>> = {
  "user-a": [{ tenant_id: TENANT_A, entitlements: ["lending.evidence", "lending.vendors.write"], status: "active" }],
  "user-two": [
    { tenant_id: TENANT_A, entitlements: ["lending.evidence"], status: "active" },
    { tenant_id: TENANT_B, entitlements: ["*"], status: "active" },
  ],
  "user-none": [],
};

function fakeMaster() {
  const calls: Array<{ url: string; headers: Record<string, string> }> = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const headers = Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>));
    calls.push({ url, headers });
    const id = USERS[(headers.Authorization ?? "").replace(/^Bearer\s+/, "")];

    if (url.startsWith(`${ENV.masterUrl}/auth/v1/user`)) {
      return id
        ? new Response(JSON.stringify({ id, email: `${id}@example.test` }), { status: 200 })
        : new Response("{}", { status: 401 });
    }
    if (url.startsWith(`${ENV.masterUrl}/rest/v1/${ENV.membershipTable}`)) {
      // Stands in for master's row security: keyed on the token's own user.
      return new Response(JSON.stringify((id && MEMBERSHIPS[id]) || []), { status: 200 });
    }
    throw new Error(`unexpected upstream call: ${url}`);
  }) as unknown as typeof fetch;
  return { fetch: fetchImpl, calls };
}

function get(headers: Record<string, string> = {}, path = "/api/cube/whoami") {
  return {
    method: "GET",
    url: `https://shell.example${path}`,
    headers: { get: (n: string) => headers[n] ?? headers[n.toLowerCase()] ?? null },
  };
}

describe("GET /api/cube/whoami", () => {
  it("returns the caller's own identity, tenant and entitlements", async () => {
    const up = fakeMaster();
    const res = await handleCubeRequest(get({ Authorization: "Bearer token-a" }), { env: ENV, fetch: up.fetch });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      user: { id: "user-a", email: "user-a@example.test" },
      tenant: TENANT_A,
      entitlements: ["lending.evidence", "lending.vendors.write"],
      tenant_state: "resolved",
    });
    expect(res.headers["cache-control"]).toBe("no-store");
  });

  it("never touches the Cube and never sends the Cube credential anywhere", async () => {
    const up = fakeMaster();
    await handleCubeRequest(get({ Authorization: "Bearer token-a" }), { env: ENV, fetch: up.fetch });

    expect(up.calls.every((c) => c.url.startsWith(ENV.masterUrl))).toBe(true);
    expect(JSON.stringify(up.calls)).not.toContain(CUBE_SECRET);
  });

  it("refuses a missing or forged session", async () => {
    const up = fakeMaster();
    const attempts: Array<Record<string, string>> = [{}, { Authorization: "Bearer forged" }, { Authorization: "token-a" }];
    for (const headers of attempts) {
      const res = await handleCubeRequest(get(headers), { env: ENV, fetch: up.fetch });
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: "not_authenticated" });
    }
  });

  it("answers a signed-in user with no membership as someone with no tenant — not as a refusal", async () => {
    const up = fakeMaster();
    const res = await handleCubeRequest(get({ Authorization: "Bearer token-none" }), { env: ENV, fetch: up.fetch });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ user: { id: "user-none" }, tenant: null, entitlements: [], tenant_state: "unresolved" });
  });

  it("does not guess between two tenants, and honours a pin only for a tenant the caller belongs to", async () => {
    const up = fakeMaster();
    const auth = { Authorization: "Bearer token-two" };

    const unpinned = await handleCubeRequest(get(auth), { env: ENV, fetch: up.fetch });
    expect(unpinned.body).toMatchObject({ tenant: null, entitlements: [], tenant_state: "ambiguous" });

    const pinned = await handleCubeRequest(get({ ...auth, "X-Tenant-Id": TENANT_B }), { env: ENV, fetch: up.fetch });
    expect(pinned.body).toMatchObject({ tenant: TENANT_B, entitlements: ["*"], tenant_state: "resolved" });

    // user-a pinning a tenant they are not in learns nothing about it.
    const foreign = await handleCubeRequest(get({ Authorization: "Bearer token-a", "X-Tenant-Id": TENANT_B }), { env: ENV, fetch: up.fetch });
    expect(foreign.body).toMatchObject({ tenant: null, entitlements: [], tenant_state: "unresolved" });
  });

  it("is a read: POST to it is not a write door", async () => {
    const up = fakeMaster();
    const res = await handleCubeRequest(
      { ...get({ Authorization: "Bearer token-a" }), method: "POST", json: async () => ({}) },
      { env: ENV, fetch: up.fetch }
    );
    expect(res.status).toBe(404);
    expect(up.calls).toHaveLength(0);
  });
});
