import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The one-time code door (BOR-141).
 *
 * What matters here is what the door refuses to do: it never creates an
 * account, it never says whether an address has one, and it never stores a
 * session it was not handed.
 */

const stored = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => stored.get(k) ?? null,
  setItem: (k: string, v: string) => void stored.set(k, v),
  removeItem: (k: string) => void stored.delete(k),
});

const auth = await import("./lawdog-auth");

const CFG = { url: "https://door.example", anonKey: "anon-key", storageKey: "test.session" };

let fetchMock: ReturnType<typeof vi.fn>;

function respond(status: number, body: unknown = {}) {
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), { status }));
}

beforeEach(() => {
  stored.clear();
  auth.configureAuth({ ...CFG, storageKey: `test.session.${Math.random()}` });
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => stored.get(k) ?? null,
    setItem: (k: string, v: string) => void stored.set(k, v),
    removeItem: (k: string) => void stored.delete(k),
  });
});

describe("asking for a code", () => {
  it("asks the door's own sign-in service, and never asks it to create an account", async () => {
    respond(200);
    await auth.requestEmailCode("person@example.test");

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://door.example/auth/v1/otp");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ email: "person@example.test", create_user: false });
    expect((init.headers as Record<string, string>).apikey).toBe("anon-key");
  });

  it("answers the same way for an address with no account as for one with", async () => {
    respond(200);
    const known = await auth.requestEmailCode("known@example.test");

    // What the service says when sign-ups are off and the address is unknown.
    respond(422, { error_code: "otp_disabled", msg: "Signups not allowed for otp" });
    const unknown = await auth.requestEmailCode("nobody@example.test");

    expect(unknown).toEqual(known);
  });

  it("does say so when the service is rate-limiting — that is true for every address", async () => {
    respond(429, { msg: "rate limit" });
    await expect(auth.requestEmailCode("person@example.test")).rejects.toThrow(/Too many requests/);
  });

  it("stores nothing", async () => {
    respond(200);
    await auth.requestEmailCode("person@example.test");
    expect(auth.getSession()).toBeNull();
    expect(stored.size).toBe(0);
  });
});

describe("typing the code", () => {
  const SESSION = {
    access_token: "access-1",
    refresh_token: "refresh-1",
    expires_in: 3600,
    user: { email: "person@example.test" },
  };

  it("trades the code for a session and signs in", async () => {
    respond(200, SESSION);
    const seen: Array<string | null> = [];
    const off = auth.onAuthChange((s) => seen.push(s?.email ?? null));

    const s = await auth.verifyEmailCode("person@example.test", " 123 456 ");
    off();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://door.example/auth/v1/verify");
    expect(JSON.parse(String(init.body))).toEqual({ type: "email", email: "person@example.test", token: "123456" });
    expect(s.email).toBe("person@example.test");
    expect(auth.isSignedIn()).toBe(true);
    expect(seen).toEqual(["person@example.test"]);
  });

  it("does not call out at all for something that could not be a code", async () => {
    for (const junk of ["", "12345", "abcdef", "123456; drop", "12345678901"]) {
      await expect(auth.verifyEmailCode("person@example.test", junk)).rejects.toThrow(/digits only/);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("gives one message for a wrong code and an expired one, and stores nothing", async () => {
    respond(403, { error_code: "otp_expired", msg: "Token has expired or is invalid" });
    await expect(auth.verifyEmailCode("person@example.test", "123456")).rejects.toThrow(/did not work/);
    expect(auth.getSession()).toBeNull();
  });

  it("refuses a 200 that carries no session", async () => {
    respond(200, { user: { email: "person@example.test" } });
    await expect(auth.verifyEmailCode("person@example.test", "123456")).rejects.toThrow(/did not work/);
    expect(auth.isSignedIn()).toBe(false);
  });
});
