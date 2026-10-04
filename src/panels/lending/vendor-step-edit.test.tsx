// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Refine } from "@refinedev/core";

/**
 * THE DOM ASSERTION BOR-132 ASKS FOR: a member without `lending.role.vendor-risk`
 * opening a vendor checklist step sees the edit control ABSENT.
 *
 * What is real here: `<Refine>`, `<CanAccess>`, the access control provider and
 * `brokerGet` — the whole client path from the component down to `fetch`. What
 * is stubbed is the network: `/api/cube/can` answers the way the broker does
 * (server/broker/can.test.ts proves that half), and the session token.
 *
 * THE COUNTERFACTUAL IS IN THE SAME FILE. "Absent" is only worth asserting if
 * the same render, with a yes from the server, puts the control in the page —
 * otherwise a component that never renders anything would pass.
 */

vi.mock("@/data/lawdog-auth", () => ({ getAccessToken: async () => "session-token" }));
vi.mock("@/config", () => ({ getConfig: () => ({ data: { mode: "cube-broker", broker: {} } }) }));

const { brokerAccessControlProvider } = await import("@/data/refine-access-control");
const { VendorStepEdit, stepCanId } = await import("./vendor-step-edit");

// React's act() needs to be told it is running under a test.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const PAYFLOW = "862552ac-c4a1-45ae-8a3e-068c9a9ecdda";
const STEP = { vendorId: PAYFLOW, factKey: "subcontractor_disclosure" };

/** Exactly what the two members on tenant borrowworks get today. */
const REFUSED = {
  can: false,
  reason: "Vendor-risk role required. Only a member holding the vendor-risk role can change a vendor checklist step. Ask your administrator for the role; the attempt has been recorded.",
  rule_key: "bw-gate-vendor-step-write",
  version: 1,
};

const asked: string[] = [];
let canAnswer: Record<string, unknown> | "fail" = REFUSED;
let postAnswer: { status: number; body: Record<string, unknown> } = { status: 200, body: {} };

function stubBroker() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      asked.push(`${init?.method ?? "GET"} ${input}`);
      if (String(input).startsWith("/api/cube/can?")) {
        if (canAnswer === "fail") return new Response(JSON.stringify({ error: "upstream_error" }), { status: 502 });
        return new Response(JSON.stringify({ resource: "can", tenant: "t", rows: [canAnswer] }), { status: 200 });
      }
      if (input === "/api/cube/lending_vendor_checklist" && init?.method === "POST") {
        return new Response(JSON.stringify(postAnswer.body), { status: postAnswer.status });
      }
      return new Response(JSON.stringify({ error: "unknown_resource" }), { status: 404 });
    })
  );
}

let host: HTMLDivElement;
let root: Root;

async function settle() {
  // The can query, then React's commit of its result.
  for (let i = 0; i < 6; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

async function open(status: string | null = "NOT STARTED") {
  const dataProvider = (await import("@/data/refine-data-provider")).brokerDataProvider;
  await act(async () => {
    root.render(
      <Refine
        dataProvider={dataProvider}
        accessControlProvider={brokerAccessControlProvider}
        resources={[]}
        options={{ mutationMode: "pessimistic", disableTelemetry: true, syncWithLocation: false }}
      >
        <table>
          <tbody>
            <tr>
              <td data-testid="title">Subcontractor disclosure</td>
              <td data-testid="edit-cell">
                <VendorStepEdit step={STEP} status={status} />
              </td>
            </tr>
          </tbody>
        </table>
      </Refine>
    );
  });
  await settle();
}

const control = () => host.querySelector('[data-testid="vendor-step-edit"]');
const select = () => host.querySelector("select");

beforeEach(() => {
  asked.length = 0;
  canAnswer = REFUSED;
  postAnswer = { status: 200, body: {} };
  stubBroker();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

describe("a member WITHOUT lending.role.vendor-risk opening a vendor checklist step", () => {
  it("sees the step, and the edit control is ABSENT from the page — not disabled, not hidden", async () => {
    await open();

    // The row itself rendered: this is not an empty page passing by accident.
    expect(host.querySelector('[data-testid="title"]')?.textContent).toBe("Subcontractor disclosure");

    expect(control()).toBeNull();
    expect(select()).toBeNull();
    expect(host.querySelectorAll("select, button, input, [disabled]")).toHaveLength(0);
    expect(host.querySelector('[data-testid="edit-cell"]')?.innerHTML).toBe("");
  });

  it("was refused by the server, for THIS step, by asking the `can` route", async () => {
    await open();
    const q = new URLSearchParams({ resource: "lending_vendor_checklist", action: "edit", id: stepCanId(STEP) });
    expect(asked).toEqual([`GET /api/cube/can?${q.toString()}`]);
  });
});

describe("the counterfactual — the same render, and the server says yes", () => {
  it("puts the control IN the page", async () => {
    canAnswer = { can: true };
    await open();
    expect(control()).not.toBeNull();
    expect(select()).not.toBeNull();
    expect(Array.from(select()!.options).map((o) => o.value)).toEqual(["NOT STARTED", "IN PROGRESS", "COMPLETE"]);
  });
});

describe("no answer is not a yes", () => {
  it("keeps the control absent when the `can` route fails", async () => {
    canAnswer = "fail";
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await open();
    expect(control()).toBeNull();
    quiet.mockRestore();
  });

  it("keeps the control absent on a sealed step, whoever is asking", async () => {
    canAnswer = { can: false, reason: "This step is sealed. …", rule_key: "bw-gate-step-sealed", version: 1 };
    await open("COMPLETE");
    expect(control()).toBeNull();
  });
});

describe("when the wall refuses a write anyway", () => {
  it("shows the rule's own words on the field, and sends exactly one write", async () => {
    canAnswer = { can: true };
    postAnswer = {
      status: 403,
      body: {
        ok: false,
        error: "role_required",
        refused: true,
        rule_key: "bw-gate-vendor-step-write",
        version: 1,
        label: "Vendor-risk role required.",
        description: "Only a member holding the vendor-risk role can change a vendor checklist step. Ask your administrator for the role; the attempt has been recorded.",
      },
    };
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await open();

    const el = select()!;
    await act(async () => {
      el.value = "IN PROGRESS";
      el.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await settle();

    expect(asked.filter((a) => a.startsWith("POST "))).toEqual(["POST /api/cube/lending_vendor_checklist"]);
    expect(host.querySelector('[role="alert"]')?.textContent).toBe(
      "Vendor-risk role required. Only a member holding the vendor-risk role can change a vendor checklist step. Ask your administrator for the role; the attempt has been recorded."
    );
    quiet.mockRestore();
  });
});
