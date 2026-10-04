import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The provider decides nothing, so what is tested is that it ASKS correctly and
 * REPEATS faithfully: the question that reaches the broker, the rule that comes
 * back with a no, and the difference between a refusal (an answer) and a
 * failure (not one, and not to be cached as one).
 */

const brokerGet = vi.fn();

class BrokerError extends Error {
  code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

vi.mock("./cube-broker", () => ({ brokerGet, BrokerError }));

const { brokerAccessControlProvider } = await import("./refine-access-control");
const can = brokerAccessControlProvider.can;

const STEP_ID = "862552ac-c4a1-45ae-8a3e-068c9a9ecdda:subcontractor_disclosure";
const REFUSED = {
  can: false,
  reason: "Vendor-risk role required. Only a member holding the vendor-risk role can change a vendor checklist step. Ask your administrator for the role; the attempt has been recorded.",
  rule_key: "bw-gate-vendor-step-write",
  version: 1,
  label: "Vendor-risk role required.",
  description: "Only a member holding the vendor-risk role can change a vendor checklist step. Ask your administrator for the role; the attempt has been recorded.",
};

beforeEach(() => {
  brokerGet.mockReset();
});

describe("what it asks", () => {
  it("sends resource, action and the row id to the `can` route, through brokerGet", async () => {
    brokerGet.mockResolvedValue([{ can: true }]);
    await can({ resource: "lending_vendor_checklist", action: "edit", params: { id: STEP_ID } });
    expect(brokerGet).toHaveBeenCalledWith("can", { resource: "lending_vendor_checklist", action: "edit", id: STEP_ID });
  });

  it("sends no id when there is none, rather than an empty one", async () => {
    brokerGet.mockResolvedValue([{ can: true }]);
    await can({ resource: "lending_vendor_checklist", action: "create" });
    expect(brokerGet).toHaveBeenCalledWith("can", { resource: "lending_vendor_checklist", action: "create" });
  });

  it("knocks on the broker resource the registry maps a rail name to", async () => {
    brokerGet.mockResolvedValue([{ can: true }]);
    await can({ resource: "vendors", action: "list", params: { resource: { name: "vendors", meta: { resource: "lending_vendors" } } } });
    expect(brokerGet).toHaveBeenCalledWith("can", { resource: "lending_vendors", action: "list" });
  });

  it("asks nothing, and says no, when no resource is named", async () => {
    expect(await can({ action: "edit" })).toEqual({ can: false });
    expect(brokerGet).not.toHaveBeenCalled();
  });
});

describe("what it repeats", () => {
  it("returns a yes as a yes", async () => {
    brokerGet.mockResolvedValue([{ can: true }]);
    expect(await can({ resource: "lending_vendor_checklist", action: "edit", params: { id: STEP_ID } })).toEqual({ can: true });
  });

  it("returns a no with the rule's own reason, key and version — nothing composed here", async () => {
    brokerGet.mockResolvedValue([REFUSED]);
    expect(await can({ resource: "lending_vendor_checklist", action: "edit", params: { id: STEP_ID } })).toEqual(REFUSED);
  });

  it("treats anything that is not exactly `can: true` as a no", async () => {
    for (const rows of [[], [{}], [{ can: "true" }], [{ can: 1 }], [{ can: null }]]) {
      brokerGet.mockResolvedValue(rows);
      expect((await can({ resource: "lending_vendor_checklist", action: "edit" })).can, JSON.stringify(rows)).toBe(false);
    }
  });
});

describe("a refusal is an answer; a failure is not", () => {
  it("answers no for signed-out, no tenant, not entitled and a malformed question", async () => {
    for (const code of ["not_authenticated", "not_entitled", "tenant_unresolved", "tenant_ambiguous", "bad_filter"]) {
      brokerGet.mockRejectedValue(new BrokerError(code));
      expect(await can({ resource: "lending_vendor_checklist", action: "edit" }), code).toEqual({ can: false });
    }
  });

  it("throws on a timeout or an unreachable broker, so it is never cached as a no", async () => {
    for (const code of ["timeout", "unreachable", "upstream_error", "http_500"]) {
      brokerGet.mockRejectedValue(new BrokerError(code));
      await expect(can({ resource: "lending_vendor_checklist", action: "edit" }), code).rejects.toMatchObject({ code });
    }
  });
});

describe("caching", () => {
  it("holds a verdict for the session and hides what is not allowed", () => {
    expect(brokerAccessControlProvider.options?.queryOptions).toMatchObject({ staleTime: Infinity });
    expect(brokerAccessControlProvider.options?.buttons).toMatchObject({ enableAccessControl: true, hideIfUnauthorized: true });
  });
});
