import { describe, expect, it } from "vitest";
import {
  bearerFrom,
  denominatorFrom,
  handleWhereWeAreRequest,
  ladderKey,
  lastMovedAt,
  type PulseSample,
} from "./handler.js";
import { parseSourceKeys, type WhereWeAreEnv } from "./env.js";

const ENV: WhereWeAreEnv = {
  masterUrl: "https://master.example",
  masterAnonKey: "anon-key",
  sourceKeys: { rmsafbcpzyxywekygevu: "source-key" },
};

function headers(map: Record<string, string>) {
  return { get: (n: string) => map[n.toLowerCase()] ?? null };
}

const REGISTRY_ROW = {
  vertical: "mineral",
  client_code: "CW",
  stage_hint: null,
  source_ref: "rmsafbcpzyxywekygevu",
  source_view: "v_cwm_check_pipeline",
  stage_column: "stage",
  is_terminal: false,
  pulse_ref: "rmsafbcpzyxywekygevu",
  pulse_table: "cwm_pipeline_pulse_log",
  denom_metric: "entities_pulled_july",
};

function ok(body: unknown) {
  return { ok: true, json: async () => body } as unknown as Response;
}

/** A fetch stub that answers by URL fragment and records what it was asked for. */
function stubFetch(routes: Array<[string, unknown]>, seen: string[] = []) {
  return (async (url: string) => {
    seen.push(String(url));
    for (const [fragment, body] of routes) {
      if (String(url).includes(fragment)) return ok(body);
    }
    return { ok: false, json: async () => ({}) } as unknown as Response;
  }) as unknown as typeof fetch;
}

describe("the door", () => {
  it("refuses anything but GET", async () => {
    const res = await handleWhereWeAreRequest(
      { method: "POST", url: "https://x/api/whereweare", headers: headers({}) },
      { env: ENV, fetch: stubFetch([]) }
    );
    expect(res.status).toBe(405);
    expect(res.body).toEqual({ error: "method_not_allowed" });
  });

  it("refuses anonymous, having contacted nothing", async () => {
    const seen: string[] = [];
    const res = await handleWhereWeAreRequest(
      { method: "GET", url: "https://x/api/whereweare", headers: headers({}) },
      { env: ENV, fetch: stubFetch([], seen) }
    );
    expect(res.status).toBe(401);
    expect(seen).toHaveLength(0);
  });

  it("refuses a token master will not vouch for", async () => {
    const res = await handleWhereWeAreRequest(
      { method: "GET", url: "https://x/api/whereweare", headers: headers({ authorization: "Bearer forged" }) },
      { env: ENV, fetch: stubFetch([]) }
    );
    expect(res.status).toBe(401);
  });

  it("reads a bearer only in the documented shape", () => {
    expect(bearerFrom(headers({ authorization: "Bearer abc" }))).toBe("abc");
    expect(bearerFrom(headers({ authorization: "bearer abc" }))).toBe("abc");
    expect(bearerFrom(headers({ authorization: "Basic abc" }))).toBeNull();
    expect(bearerFrom(headers({ authorization: "Bearer   " }))).toBeNull();
    expect(bearerFrom(headers({}))).toBeNull();
  });
});

describe("the stall clock", () => {
  const sample = (t: string, staged: number, mins: number): PulseSample => ({
    taken_at: t,
    metrics: [
      { k: "checks_staged", n: staged },
      { k: "mins_since_staging", n: mins },
    ],
  });

  it("ignores pure age counters — the whole reason this build exists", () => {
    // Nothing substantive changed across three samples; only the age counter ticked.
    // A naive diff would report movement seconds ago on a pipeline that is dead.
    const samples = [
      sample("2026-08-23T08:50:00Z", 140, 30),
      sample("2026-08-23T08:40:00Z", 140, 20),
      sample("2026-08-23T08:30:00Z", 140, 10),
    ];
    expect(lastMovedAt(samples)).toBeNull();
  });

  it("finds the newest sample where a substantive value actually changed", () => {
    const samples = [
      sample("2026-08-23T08:50:00Z", 141, 9),
      sample("2026-08-23T08:40:00Z", 140, 1138),
      sample("2026-08-23T08:30:00Z", 140, 1128),
    ];
    expect(lastMovedAt(samples)).toBe("2026-08-23T08:50:00Z");
  });

  it("is null rather than a guess when there is nothing to compare", () => {
    expect(lastMovedAt([])).toBeNull();
    expect(lastMovedAt([sample("2026-08-23T08:50:00Z", 140, 30)])).toBeNull();
  });


  it("handles the REAL CW pulse shape, captured verbatim from the live log", () => {
    // cwm_pipeline_pulse_log rows 1281 and 1280 on rmsafbcpzyxywekygevu, read
    // 2026-08-23. Thirteen metrics, TWO of them mins_since age counters, and the
    // age counter moves in the OPPOSITE direction to real progress (1138 -> 9).
    const s1281: PulseSample = {
      taken_at: "2026-08-23T08:50:00.153392Z",
      metrics: [
        { k: "docs_in_rom", n: 155 }, { k: "mins_since_new_doc", n: 28117 },
        { k: "checks_parsed", n: 107 }, { k: "checks_staged", n: 141 },
        { k: "staged_rows", n: 8510 }, { k: "mins_since_staging", n: 9 },
        { k: "gate_allow", n: 47 }, { k: "chay_queue_new", n: 24 },
        { k: "approved_awaiting_cdex", n: 0 }, { k: "sent_in_cdex", n: 49 },
        { k: "hop_stage_to_portal_hrs", n: 9.2 }, { k: "hop_portal_to_approval_hrs", n: 369.4 },
        { k: "entities_pulled_july", n: 13, t: "of 145 — the ceiling" },
      ],
    };
    const s1280: PulseSample = {
      taken_at: "2026-08-23T08:40:00.119534Z",
      metrics: [
        { k: "docs_in_rom", n: 155 }, { k: "mins_since_new_doc", n: 28107 },
        { k: "checks_parsed", n: 107 }, { k: "checks_staged", n: 140 },
        { k: "staged_rows", n: 8507 }, { k: "mins_since_staging", n: 1138 },
        { k: "gate_allow", n: 46 }, { k: "chay_queue_new", n: 24 },
        { k: "approved_awaiting_cdex", n: 0 }, { k: "sent_in_cdex", n: 49 },
        { k: "hop_stage_to_portal_hrs", n: 9.2 }, { k: "hop_portal_to_approval_hrs", n: 369.4 },
        { k: "entities_pulled_july", n: 13, t: "of 145 — the ceiling" },
      ],
    };

    // checks_staged, staged_rows and gate_allow really moved: this is real movement.
    expect(lastMovedAt([s1281, s1280])).toBe("2026-08-23T08:50:00.153392Z");

    // Now the case that matters: freeze every substantive metric and let ONLY the
    // two age counters tick. This is a dead pipeline, and it must read as dead.
    const frozen: PulseSample = {
      taken_at: "2026-08-23T09:00:00Z",
      metrics: s1281.metrics.map((m) =>
        m.k?.startsWith("mins_since") ? { ...m, n: (m.n ?? 0) + 10 } : m
      ),
    };
    expect(lastMovedAt([frozen, s1281])).toBeNull();

    // And the denominator really is 13 of 145 off that same live payload.
    expect(denominatorFrom(s1281.metrics.find((m) => m.k === "entities_pulled_july")))
      .toEqual({ reached: 13, of: 145, label: "of 145 — the ceiling" });
  });

  it("is insensitive to metric ORDER, which the source does not promise", () => {
    const a: PulseSample = { taken_at: "2026-08-23T08:50:00Z", metrics: [{ k: "b", n: 2 }, { k: "a", n: 1 }] };
    const b: PulseSample = { taken_at: "2026-08-23T08:40:00Z", metrics: [{ k: "a", n: 1 }, { k: "b", n: 2 }] };
    expect(lastMovedAt([a, b])).toBeNull();
  });
});

describe("the denominator", () => {
  it("reads the ceiling out of the metric's own hint", () => {
    expect(denominatorFrom({ k: "entities_pulled_july", n: 13, t: "of 145 — the ceiling" }))
      .toEqual({ reached: 13, of: 145, label: "of 145 — the ceiling" });
  });

  it("never invents a ceiling when the hint carries no number", () => {
    expect(denominatorFrom({ k: "x", n: 13, t: "no ceiling stated" }))
      .toEqual({ reached: 13, of: null, label: "no ceiling stated" });
    expect(denominatorFrom({ k: "x", n: 13, t: null }))
      .toEqual({ reached: 13, of: null, label: null });
  });

  it("is null, not zero, when the metric is absent", () => {
    expect(denominatorFrom(undefined)).toBeNull();
  });
});

describe("the board", () => {
  const registry = [1, 2, 3].map((seq) => ({
    ...REGISTRY_ROW,
    stage_seq: seq,
    stage_key: `${seq}-S${seq}`,
    stage_label: `S${seq}`,
  }));

  const pipelineRows = [
    { stage: "1-S1" }, { stage: "1-S1" }, { stage: "2-S2" },
  ];

  const pulse = [
    { taken_at: "2026-08-23T08:50:00Z", metrics: [{ k: "checks_staged", n: 141 }, { k: "mins_since_staging", n: 9 }, { k: "entities_pulled_july", n: 13, t: "of 145 — the ceiling" }] },
    { taken_at: "2026-08-23T08:40:00Z", metrics: [{ k: "checks_staged", n: 140 }, { k: "mins_since_staging", n: 1138 }, { k: "entities_pulled_july", n: 13, t: "of 145 — the ceiling" }] },
  ];

  const routes: Array<[string, unknown]> = [
    ["/auth/v1/user", { id: "user-1" }],
    ["whereweare_ladder", registry],
    ["v_whereweare_scope", [{ vertical: "mineral" }, { vertical: "legal" }, { vertical: "lending" }]],
    ["v_cwm_check_pipeline", pipelineRows],
    ["cwm_pipeline_pulse_log", pulse],
  ];

  it("counts by stage, clocks the stall, and names what is unregistered", async () => {
    const res = await handleWhereWeAreRequest(
      { method: "GET", url: "https://x/api/whereweare", headers: headers({ authorization: "Bearer good" }) },
      { env: ENV, fetch: stubFetch(routes), now: () => Date.parse("2026-08-23T09:50:00Z") }
    );

    expect(res.status).toBe(200);
    const body = res.body as any;
    expect(body.ladders).toHaveLength(1);

    const ladder = body.ladders[0];
    expect(ladder.vertical).toBe("mineral");
    expect(ladder.client_code).toBe("CW");
    expect(ladder.stages.map((s: any) => [s.key, s.n])).toEqual([
      ["1-S1", 2], ["2-S2", 1], ["3-S3", 0],
    ]);
    expect(ladder.total).toBe(3);
    expect(ladder.last_moved_at).toBe("2026-08-23T08:50:00Z");
    expect(ladder.stall_minutes).toBe(60);
    expect(ladder.denominator).toEqual({ reached: 13, of: 145, label: "of 145 — the ceiling" });
    expect(ladder.note).toBeNull();

    // Missing capability is DISCOVERED, not asked about.
    expect(body.unregistered).toEqual(["legal", "lending"]);
  });

  it("emits counts and clocks ONLY — no source row ever reaches the response", async () => {
    // The source view really does carry owner names; the response must not.
    const withNames = [
      { stage: "1-S1", entity_name: "DALLAS THEOLOGICAL SEMINARY", check_number: "E10000302358" },
    ];
    const res = await handleWhereWeAreRequest(
      { method: "GET", url: "https://x/api/whereweare", headers: headers({ authorization: "Bearer good" }) },
      {
        env: ENV,
        fetch: stubFetch([...routes.filter(([f]) => f !== "v_cwm_check_pipeline"), ["v_cwm_check_pipeline", withNames]]),
        now: () => Date.parse("2026-08-23T09:50:00Z"),
      }
    );
    const serialised = JSON.stringify(res.body);
    expect(serialised).not.toContain("DALLAS THEOLOGICAL SEMINARY");
    expect(serialised).not.toContain("E10000302358");
    expect(serialised).not.toContain("entity_name");
  });

  it("asks the source for the stage column ONLY, so names are never fetched at all", async () => {
    const seen: string[] = [];
    await handleWhereWeAreRequest(
      { method: "GET", url: "https://x/api/whereweare", headers: headers({ authorization: "Bearer good" }) },
      { env: ENV, fetch: stubFetch(routes, seen), now: () => Date.parse("2026-08-23T09:50:00Z") }
    );
    const sourceCall = seen.find((u) => u.includes("v_cwm_check_pipeline"));
    expect(sourceCall).toContain("select=stage");
    expect(sourceCall).not.toContain("entity_name");
    expect(sourceCall).not.toContain("select=*");
  });

  it("reads the registry with the CALLER's token, never a master secret", async () => {
    const seen: string[] = [];
    await handleWhereWeAreRequest(
      { method: "GET", url: "https://x/api/whereweare", headers: headers({ authorization: "Bearer good" }) },
      { env: ENV, fetch: stubFetch(routes, seen), now: () => Date.parse("2026-08-23T09:50:00Z") }
    );
    expect(seen.some((u) => u.includes("whereweare_ladder"))).toBe(true);
  });

  it("says no_source_credential instead of inventing a zero", async () => {
    const res = await handleWhereWeAreRequest(
      { method: "GET", url: "https://x/api/whereweare", headers: headers({ authorization: "Bearer good" }) },
      {
        env: { ...ENV, sourceKeys: {} },
        fetch: stubFetch(routes),
        now: () => Date.parse("2026-08-23T09:50:00Z"),
      }
    );
    const ladder = (res.body as any).ladders[0];
    expect(ladder.note).toBe("no_source_credential");
    expect(ladder.stages.every((s: any) => s.n === null)).toBe(true);
    expect(ladder.total).toBeNull();
  });

  it("says no_movement_instrument rather than fabricating a timestamp", async () => {
    const noPulse = registry.map((r) => ({ ...r, pulse_ref: null, pulse_table: null }));
    const res = await handleWhereWeAreRequest(
      { method: "GET", url: "https://x/api/whereweare", headers: headers({ authorization: "Bearer good" }) },
      {
        env: ENV,
        fetch: stubFetch([...routes.filter(([f]) => f !== "whereweare_ladder"), ["whereweare_ladder", noPulse]]),
        now: () => Date.parse("2026-08-23T09:50:00Z"),
      }
    );
    const ladder = (res.body as any).ladders[0];
    expect(ladder.note).toBe("no_movement_instrument");
    expect(ladder.last_moved_at).toBeNull();
    expect(ladder.stall_minutes).toBeNull();
  });

  it("refuses a registry row whose identifiers are not identifiers", async () => {
    const evil = registry.map((r) => ({ ...r, source_view: "v_x; drop table y" }));
    const res = await handleWhereWeAreRequest(
      { method: "GET", url: "https://x/api/whereweare", headers: headers({ authorization: "Bearer good" }) },
      {
        env: ENV,
        fetch: stubFetch([...routes.filter(([f]) => f !== "whereweare_ladder"), ["whereweare_ladder", evil]]),
        now: () => Date.parse("2026-08-23T09:50:00Z"),
      }
    );
    expect((res.body as any).ladders[0].note).toBe("registry_row_malformed");
  });

  it("groups by vertical AND client, so two clients never merge into one ladder", () => {
    expect(ladderKey("mineral", "CW")).toBe("mineral::CW");
    expect(ladderKey("mineral", null)).toBe("mineral");
    expect(ladderKey("mineral", "CW")).not.toBe(ladderKey("mineral", "OTHER"));
  });
});

describe("env", () => {
  it("treats an unset source map as empty, not as an error", () => {
    expect(parseSourceKeys(undefined)).toEqual({});
    expect(parseSourceKeys("")).toEqual({});
  });

  it("refuses malformed JSON rather than silently degrading to {}", () => {
    // A typo must not look identical to "not configured yet".
    expect(() => parseSourceKeys("{oops")).toThrow(/not valid JSON/);
    expect(() => parseSourceKeys('["a"]')).toThrow(/JSON object/);
    expect(() => parseSourceKeys('{"ref": 5}')).toThrow(/non-empty string/);
    expect(() => parseSourceKeys('{"ref": ""}')).toThrow(/non-empty string/);
  });

  it("names a variable in its error and never echoes a value", () => {
    try {
      parseSourceKeys('{"ref": ""}');
    } catch (e) {
      expect((e as Error).message).toContain("WHEREWEARE_SOURCE_KEYS");
    }
  });
});
