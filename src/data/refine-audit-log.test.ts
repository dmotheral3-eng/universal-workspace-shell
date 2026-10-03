import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The provider reads; it does not write. So what is tested is: that the read
 * asks for exactly one vendor's path, that a row becomes the shape Refine's
 * log hooks expect, that a refusal is an empty log and not an error, and that
 * `create` reaches no network at all.
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

const { changeLogProvider, pathPrefix, toLog } = await import("./refine-audit-log");

const VENDOR = "862552ac-c4a1-45ae-8a3e-068c9a9ecdda";

const APPLIED = {
  id: "c1",
  tenant_id: "t-1",
  book_id: "b-1",
  path: `vendors/${VENDOR}/annual_risk_review`,
  intent: "update",
  author: "ops@example.test",
  author_kind: "human",
  reasoning: null,
  status: "applied",
  corrects_id: null,
  recorded_at: "2026-09-12T23:19:53Z",
  before_state: { status: "LAPSED" },
  after_state: { status: "IN PROGRESS" },
};

const REFUSED = {
  ...APPLIED,
  id: "c2",
  path: `vendors/${VENDOR}/soc2_type_ii_report`,
  reasoning: "step_sealed",
  status: "refused",
  before_state: { status: "COMPLETE", sealed: true },
  after_state: { status: "NOT STARTED" },
};

beforeEach(() => {
  brokerGet.mockReset();
});

describe("pathPrefix", () => {
  it("ends in a slash so one id is never a prefix of a longer one", () => {
    expect(pathPrefix("vendors", VENDOR)).toBe(`vendors/${VENDOR}/`);
    expect(pathPrefix("vendors")).toBe("vendors/");
  });

  it("is null for anything that could not be a path segment", () => {
    expect(pathPrefix("vendors", "a/b")).toBeNull();
    expect(pathPrefix("vendors", "*")).toBeNull();
    expect(pathPrefix("ven dors", VENDOR)).toBeNull();
    expect(pathPrefix("", VENDOR)).toBeNull();
  });
});

describe("get", () => {
  it("asks the change record for one vendor's path and nothing wider", async () => {
    brokerGet.mockResolvedValueOnce([APPLIED, REFUSED]);
    await changeLogProvider.get({ resource: "vendors", meta: { id: VENDOR } });
    expect(brokerGet).toHaveBeenCalledWith("lending_changes", { path_prefix: `vendors/${VENDOR}/` });
  });

  it("carries the selected book when the caller names one", async () => {
    brokerGet.mockResolvedValueOnce([]);
    await changeLogProvider.get({ resource: "vendors", meta: { id: VENDOR, book_id: "b-1" } });
    expect(brokerGet).toHaveBeenCalledWith("lending_changes", { path_prefix: `vendors/${VENDOR}/`, book: "b-1" });
  });

  it("returns each row as a log entry with before and after", async () => {
    brokerGet.mockResolvedValueOnce([APPLIED, REFUSED]);
    const logs = await changeLogProvider.get({ resource: "vendors", meta: { id: VENDOR } });
    expect(logs).toHaveLength(2);
    expect(logs[0]).toEqual({
      id: "c1",
      createdAt: "2026-09-12T23:19:53Z",
      action: "update",
      resource: "vendors",
      author: { name: "ops@example.test", kind: "human" },
      data: { status: "IN PROGRESS" },
      previousData: { status: "LAPSED" },
      meta: { path: APPLIED.path, status: "applied", reasoning: null, corrects_id: null, book_id: "b-1" },
    });
    expect(logs[1].meta).toMatchObject({ status: "refused", reasoning: "step_sealed" });
  });

  it("narrows by action when one is asked for", async () => {
    brokerGet.mockResolvedValueOnce([APPLIED, { ...APPLIED, id: "c9", intent: "delete" }]);
    const logs = await changeLogProvider.get({ resource: "vendors", action: "delete", meta: { id: VENDOR } });
    expect(logs.map((l: { id: string }) => l.id)).toEqual(["c9"]);
  });

  it("asks nothing, and answers with nothing, when the id could not be a path", async () => {
    expect(await changeLogProvider.get({ resource: "vendors", meta: { id: "../x" } })).toEqual([]);
    expect(brokerGet).not.toHaveBeenCalled();
  });

  it("treats a refusal as an empty log, and still throws every other failure", async () => {
    brokerGet.mockRejectedValueOnce(new BrokerError("not_entitled"));
    expect(await changeLogProvider.get({ resource: "vendors", meta: { id: VENDOR } })).toEqual([]);

    brokerGet.mockRejectedValueOnce(new BrokerError("upstream_error"));
    await expect(changeLogProvider.get({ resource: "vendors", meta: { id: VENDOR } })).rejects.toMatchObject({
      code: "upstream_error",
    });
  });
});

describe("create and update", () => {
  it("writes nothing from the browser — the server already recorded it", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const res = await changeLogProvider.create({
      resource: "vendors",
      action: "update",
      data: { status: "IN PROGRESS" },
      previousData: { status: "LAPSED" },
      meta: { id: VENDOR },
    });
    expect(res).toEqual({ recorded: "server" });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(brokerGet).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("refuses to change a log entry", async () => {
    await expect(changeLogProvider.update({ id: "c1", name: "renamed" })).rejects.toMatchObject({ code: "unsupported" });
  });
});

describe("toLog", () => {
  it("never invents a before or after that the record does not hold", () => {
    const log = toLog({ ...APPLIED, before_state: undefined, after_state: undefined });
    expect(log.data).toBeNull();
    expect(log.previousData).toBeNull();
  });
});
