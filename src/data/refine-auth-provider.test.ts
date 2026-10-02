import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The provider is a wrapper, so what is tested is the wrapping: that every
 * answer comes from the module that already owns sign-in, that roles come from
 * the broker and are asked for once, and that a refusal never signs anyone out.
 */

let token: string | null = "tok-1";
let session: { email: string } | null = { email: "ops@example.test" };
let mode = "cube-broker";
let pinnedTenant: string | undefined;
const authListeners: Array<() => void> = [];

const signIn = vi.fn(async () => ({}));
const signOut = vi.fn(async () => undefined);
const signInWithProvider = vi.fn();

vi.mock("@/config", () => ({
  getConfig: () => ({ data: { mode, broker: { tenantId: pinnedTenant } } }),
}));

vi.mock("./lawdog-auth", () => ({
  getAccessToken: async () => token,
  getSession: () => session,
  onAuthChange: (fn: () => void) => {
    authListeners.push(fn);
    return () => undefined;
  },
  signIn,
  signOut,
  signInWithProvider,
}));

const { shellAuthProvider, whoAmI } = await import("./refine-auth-provider");

const WHO = {
  user: { id: "user-a", email: "ops@example.test" },
  tenant: "t-1",
  entitlements: ["lending.evidence", "lending.vendors.write"],
  tenant_state: "resolved",
};

let fetchMock: ReturnType<typeof vi.fn>;
let whoStatus = 200;

beforeEach(() => {
  token = "tok-1";
  session = { email: "ops@example.test" };
  mode = "cube-broker";
  pinnedTenant = undefined;
  whoStatus = 200;
  authListeners.forEach((fn) => fn()); // forget anything cached by the previous test
  signIn.mockClear();
  signOut.mockClear();
  signInWithProvider.mockClear();
  fetchMock = vi.fn(async () => new Response(JSON.stringify(whoStatus === 200 ? WHO : { error: "not_authenticated" }), { status: whoStatus }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("check", () => {
  it("is authenticated when lawdog-auth has a usable token, without a network call", async () => {
    expect(await shellAuthProvider.check()).toEqual({ authenticated: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("is not authenticated when there is none — and names no URL to go to", async () => {
    token = null;
    const res = await shellAuthProvider.check();
    expect(res).toEqual({ authenticated: false, logout: true });
    expect(res.redirectTo).toBeUndefined();
  });
});

describe("login / logout delegate to the existing sign-in", () => {
  it("starts the provider redirect", async () => {
    expect(await shellAuthProvider.login({ provider: "google" })).toEqual({ success: true });
    expect(signInWithProvider).toHaveBeenCalledWith("google");
  });

  it("uses the existing password flow", async () => {
    expect(await shellAuthProvider.login({ email: "a@example.test", password: "pw" })).toEqual({ success: true });
    expect(signIn).toHaveBeenCalledWith("a@example.test", "pw");
  });

  it("resolves with a failure rather than throwing", async () => {
    signIn.mockRejectedValueOnce(new Error("Invalid login credentials"));
    const res = await shellAuthProvider.login({ email: "a@example.test", password: "pw" });
    expect(res.success).toBe(false);
    expect((res.error as Error).message).toBe("Invalid login credentials");

    expect((await shellAuthProvider.login({})).success).toBe(false);
  });

  it("signs out through lawdog-auth", async () => {
    expect(await shellAuthProvider.logout({})).toEqual({ success: true });
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});

describe("identity and permissions come from the broker", () => {
  it("asks whoami same-origin with the session and nothing else", async () => {
    await whoAmI();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/cube/whoami");
    expect(Object.keys(init.headers as Record<string, string>)).toEqual(["Authorization"]);
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok-1");
  });

  it("returns the entitlements the broker resolved", async () => {
    expect(await shellAuthProvider.getPermissions!()).toEqual(["lending.evidence", "lending.vendors.write"]);
  });

  it("returns id, name and tenant", async () => {
    expect(await shellAuthProvider.getIdentity!()).toEqual({
      id: "user-a",
      name: "ops@example.test",
      email: "ops@example.test",
      tenant: "t-1",
    });
  });

  it("reads once per token: identity, permissions and a second ask share one request", async () => {
    await shellAuthProvider.getIdentity!();
    await shellAuthProvider.getPermissions!();
    await shellAuthProvider.getPermissions!();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("asks again when the token changes", async () => {
    await shellAuthProvider.getPermissions!();
    token = "tok-2";
    await shellAuthProvider.getPermissions!();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(((fetchMock.mock.calls[1] as unknown[])[1] as RequestInit).headers).toMatchObject({ Authorization: "Bearer tok-2" });
  });

  it("does not remember a failed lookup as 'no roles'", async () => {
    whoStatus = 502;
    expect(await shellAuthProvider.getPermissions!()).toEqual([]);
    whoStatus = 200;
    expect(await shellAuthProvider.getPermissions!()).toEqual(["lending.evidence", "lending.vendors.write"]);
  });

  it("falls back to the session's email when the broker cannot be asked", async () => {
    whoStatus = 502;
    expect(await shellAuthProvider.getIdentity!()).toEqual({
      id: "ops@example.test",
      name: "ops@example.test",
      email: "ops@example.test",
      tenant: null,
    });
  });

  it("has no identity and no permissions signed out, and asks nobody", async () => {
    token = null;
    session = null;
    expect(await shellAuthProvider.getIdentity!()).toBeNull();
    expect(await shellAuthProvider.getPermissions!()).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not ask on a profile with no broker", async () => {
    mode = "mock";
    expect(await shellAuthProvider.getPermissions!()).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("onError", () => {
  it("signs out only when the session itself was refused", async () => {
    expect(await shellAuthProvider.onError({ code: "not_authenticated" })).toMatchObject({ logout: true });
  });

  it("treats every refusal and fault as an answer, not a logout", async () => {
    for (const code of ["not_entitled", "role_required", "step_sealed", "tenant_unresolved", "upstream_error", "timeout", undefined]) {
      expect(await shellAuthProvider.onError({ code }), String(code)).toEqual({});
    }
    expect(await shellAuthProvider.onError(null)).toEqual({});
    expect(signOut).not.toHaveBeenCalled();
  });
});
