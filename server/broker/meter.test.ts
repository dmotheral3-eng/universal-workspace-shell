import { describe, expect, it } from "vitest";
import { meterAppAction } from "./meter";
import type { BrokerEnv } from "./env";

/**
 * Meter tests (BOR-70).
 *
 * Two things are being proven, and the second matters more than the first:
 *
 *  1. The call it makes is the call the Cube expects — the handler's OWN name,
 *     the method uppercased, the lending schema profile, the service credential.
 *  2. IT CANNOT HURT THE CALLER. Every failure mode — refusal, timeout, outage,
 *     junk body — resolves to null instead of throwing, because a customer
 *     asking for their rows must never be handed our accounting problem.
 *
 * The gap cases are asserted too: an unmapped handler and an unruled action are
 * both LOGGED BY NAME rather than swallowed. A meter that quietly counts nothing
 * is the exact defect BOR-66 was filed about, so silence here is a test failure.
 */

const ENV: BrokerEnv = {
  masterUrl: "https://master.example",
  masterAnonKey: "master-anon-key",
  cubeUrl: "https://cube.example",
  cubeKey: "cube-broker-key-must-never-leak",
  cubeSchema: "legal",
  membershipTable: "shell_tenant_members",
};

const TENANT = "6f361690-9876-43e8-b5bd-9bba6c44ae68";

interface Recorded {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

function fakeCube(reply: unknown, status = 200) {
  const calls: Recorded[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: String(input),
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: JSON.parse(String(init?.body ?? "{}")),
    });
    return new Response(JSON.stringify(reply), {
      status,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

function logger() {
  const lines: string[] = [];
  return { lines, log: (m: string) => lines.push(m) };
}

describe("meterAppAction", () => {
  it("posts the handler's own name to fn_meter_app_action with the lending profile", async () => {
    const { fetchImpl, calls } = fakeCube({ charged: false, credits: 0, map_ruled: false });
    const verdict = await meterAppAction(
      {
        tenantId: TENANT,
        surface: "/api/cube",
        handler: "handleCubeRequest",
        method: "get",
        resource: "lending_vendors",
        refId: "lending_vendors",
        evidence: "brokered read returned 7 row(s)",
      },
      { env: ENV, fetch: fetchImpl }
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://cube.example/rest/v1/rpc/fn_meter_app_action");
    expect(calls[0].headers["Accept-Profile"]).toBe("lending");
    expect(calls[0].body.p_handler).toBe("handleCubeRequest");
    // Lowercase in, uppercase out: the map is keyed on the canonical method.
    expect(calls[0].body.p_method).toBe("GET");
    expect(calls[0].body.p_resource).toBe("lending_vendors");
    expect(verdict).toMatchObject({ charged: false, credits: 0 });
  });

  it("does nothing at all when the tenant did not resolve", async () => {
    const { fetchImpl, calls } = fakeCube({});
    const { lines, log } = logger();

    const verdict = await meterAppAction(
      { tenantId: "", surface: "/api/cube", handler: "handleCubeRequest", method: "GET" },
      { env: ENV, fetch: fetchImpl, log }
    );

    expect(verdict).toBeNull();
    expect(calls).toHaveLength(0);
    expect(lines.join(" ")).toContain("tenant_unresolved");
  });

  it("names an unmapped handler as a meter gap instead of swallowing it", async () => {
    const { fetchImpl } = fakeCube({ metered: false, reason: "unmapped_handler" });
    const { lines, log } = logger();

    await meterAppAction(
      {
        tenantId: TENANT,
        surface: "/api/cube",
        handler: "handleSomethingNobodyMapped",
        method: "GET",
        resource: "lending_ghost",
      },
      { env: ENV, fetch: fetchImpl, log }
    );

    const line = lines.join(" ");
    expect(line).toContain("meter_gap");
    expect(line).toContain("handleSomethingNobodyMapped");
  });

  it("names an unruled action rather than guessing a price", async () => {
    const { fetchImpl } = fakeCube({ metered: false, reason: "unruled_action" });
    const { lines, log } = logger();

    await meterAppAction(
      {
        tenantId: TENANT,
        surface: "/api/cube",
        handler: "handleDecisionWrite",
        method: "POST",
        resource: "lending_decision_log",
      },
      { env: ENV, fetch: fetchImpl, log }
    );

    expect(lines.join(" ")).toContain("meter_unruled");
  });

  it("swallows an upstream refusal and logs the status only", async () => {
    const { fetchImpl } = fakeCube({ message: "permission denied for schema lending" }, 403);
    const { lines, log } = logger();

    const verdict = await meterAppAction(
      { tenantId: TENANT, surface: "/api/cube", handler: "handleCubeRequest", method: "GET" },
      { env: ENV, fetch: fetchImpl, log }
    );

    expect(verdict).toBeNull();
    const line = lines.join(" ");
    expect(line).toContain("meter_upstream status=403");
    // The upstream body can name schemas and hosts. It must not reach a log line.
    expect(line).not.toContain("permission denied");
  });

  it("swallows an unreachable Cube rather than throwing at the caller", async () => {
    const fetchImpl = (async () => {
      throw new Error("ECONNREFUSED cube.example");
    }) as unknown as typeof fetch;
    const { lines, log } = logger();

    const verdict = await meterAppAction(
      { tenantId: TENANT, surface: "/api/cube", handler: "handleCubeRequest", method: "GET" },
      { env: ENV, fetch: fetchImpl, log }
    );

    expect(verdict).toBeNull();
    expect(lines.join(" ")).toContain("meter_failed reason=unreachable");
  });

  it("never lets the credential appear in a log line", async () => {
    const { fetchImpl } = fakeCube({}, 500);
    const { lines, log } = logger();

    await meterAppAction(
      { tenantId: TENANT, surface: "/api/cube", handler: "handleCubeRequest", method: "GET" },
      { env: ENV, fetch: fetchImpl, log }
    );

    expect(lines.join(" ")).not.toContain(ENV.cubeKey);
  });
});
