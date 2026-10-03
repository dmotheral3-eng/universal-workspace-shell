-- BOR-117 — the demo clock, rolled every night.
--
-- TARGET: the Cube data plane (the project behind CUBE_URL), schema `obligation`.
--
-- STATUS WHEN THIS FILE WAS WRITTEN: NOT APPLIED, AND NOT RUN AGAINST THE CUBE.
-- It was written from reads of the live schema on 2026-10-03 (obligation_instances,
-- obligation_rules, bw_v_program_items, cron.job, and the migration
-- `bor117_reanchor_obligation_day_counts` applied 2026-09-07). Apply it on a
-- branch or inside BEGIN … ROLLBACK first.
--
-- THE PROBLEM. The specimen tenant's story is written in DAY COUNTS ("12 days
-- late", "Due in 5 days"). The rows hold calendar dates, and the views compute
-- the counts against CURRENT_DATE. So every night the surface reads one day
-- further from the story it was designed to tell. On 2026-10-03 the reference
-- item read 38 days late against a designed 12 — 26 days of drift since the
-- one-off re-anchor on 2026-09-07.
--
-- WHAT THIS DOES. It takes the one-off re-anchor that already ran once, makes
-- it a function, and schedules it. Nothing about the method changes:
--
--   * the shift is MEASURED from a reference row whose designed day count is
--     written down, never from a remembered seed date;
--   * it moves only OPEN instances of the specimen rules (`bw-%`), and only
--     their `due_at` / `window_open`;
--   * run twice, the second run measures 0 and moves nothing.
--
-- WHAT THIS DELIBERATELY DOES NOT DO.
--
--   1. It does not touch completed instances. A control's history is a
--      calendar fact, and the controls view counts it year-to-date.
--
--   2. It does not touch lending.evidence_decisions / _interactions / _changes
--      / _attestations. Those are append-only by trigger ("corrections are new
--      rows via corrects_id, never edits"), and that guard is right. So the two
--      complaint clocks, which are computed from evidence_interactions, STILL
--      DRIFT after this is applied. Fixing them means either writing synthetic
--      correction rows into an evidence ledger or re-seeding the tenant, and
--      which of those is acceptable is not a seat's call.
--
--   3. It does not remove future-dated evidence rows. On 2026-10-03 there were
--      18 (12 interactions, 4 decisions, 2 changes, all tenants). BOR-116 hid
--      them from the bw_v_* views; the tables still hold them.
--
-- THE REFERENCE IS A ROW, NOT A LITERAL IN THE FUNCTION. `obligation.demo_clock`
-- holds, per tenant, which rule is the reference and how many days late the
-- story says it is. A second specimen tenant is a second row, not a code change;
-- setting `active = false` stops the roll for that tenant without unscheduling.

CREATE TABLE IF NOT EXISTS obligation.demo_clock (
  tenant_id            uuid PRIMARY KEY,
  reference_rule_key   text    NOT NULL,
  reference_days_late  integer NOT NULL CHECK (reference_days_late >= 0),
  rule_key_like        text    NOT NULL DEFAULT 'bw-%',
  active               boolean NOT NULL DEFAULT true,
  note                 text,
  created_at           timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE obligation.demo_clock IS
  'BOR-117. One row per specimen tenant whose open obligations are re-anchored nightly so the designed day counts hold. reference_days_late is the designed value for reference_rule_key.';

-- Every run leaves a row, including the runs that moved nothing and the runs
-- that could not find their reference. "Did the clock roll last night" is then
-- a query, not a guess.
CREATE TABLE IF NOT EXISTS obligation.demo_clock_runs (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id   uuid        NOT NULL,
  ran_at      timestamptz NOT NULL DEFAULT now(),
  outcome     text        NOT NULL CHECK (outcome IN ('moved', 'already_anchored', 'reference_missing', 'reference_ambiguous')),
  shift_days  integer,
  rows_moved  integer     NOT NULL DEFAULT 0
);

ALTER TABLE obligation.demo_clock      ENABLE ROW LEVEL SECURITY;
ALTER TABLE obligation.demo_clock_runs ENABLE ROW LEVEL SECURITY;
-- No policies: neither table is read or written by any signed-in user. The
-- function below is SECURITY DEFINER and the scheduler runs as the owner.

CREATE OR REPLACE FUNCTION obligation.fn_demo_clock_roll()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = obligation, pg_temp
AS $$
DECLARE
  c        obligation.demo_clock%ROWTYPE;
  v_refs   integer;
  v_shift  integer;
  v_moved  integer;
  v_out    jsonb := '[]'::jsonb;
BEGIN
  FOR c IN SELECT * FROM obligation.demo_clock WHERE active LOOP
    -- The reference: exactly one OPEN instance of the named rule. None, or more
    -- than one, means the measurement is not trustworthy — record that and move
    -- nothing for this tenant rather than pick one.
    SELECT count(*), min((current_date - i.due_at) - c.reference_days_late)
      INTO v_refs, v_shift
      FROM obligation.obligation_instances i
      JOIN obligation.obligation_rules r ON r.id = i.rule_id
     WHERE i.tenant_id = c.tenant_id
       AND r.rule_key  = c.reference_rule_key
       AND i.state    <> 'done';

    IF v_refs <> 1 THEN
      INSERT INTO obligation.demo_clock_runs (tenant_id, outcome)
      VALUES (c.tenant_id, CASE WHEN v_refs = 0 THEN 'reference_missing' ELSE 'reference_ambiguous' END);
      v_out := v_out || jsonb_build_object('tenant', c.tenant_id, 'outcome',
                 CASE WHEN v_refs = 0 THEN 'reference_missing' ELSE 'reference_ambiguous' END);
      CONTINUE;
    END IF;

    IF v_shift = 0 THEN
      INSERT INTO obligation.demo_clock_runs (tenant_id, outcome, shift_days)
      VALUES (c.tenant_id, 'already_anchored', 0);
      v_out := v_out || jsonb_build_object('tenant', c.tenant_id, 'outcome', 'already_anchored');
      CONTINUE;
    END IF;

    UPDATE obligation.obligation_instances i
       SET due_at      = i.due_at      + v_shift,
           window_open = i.window_open + v_shift
      FROM obligation.obligation_rules r
     WHERE r.id = i.rule_id
       AND i.tenant_id = c.tenant_id
       AND r.rule_key LIKE c.rule_key_like
       AND i.state <> 'done';
    GET DIAGNOSTICS v_moved = ROW_COUNT;

    INSERT INTO obligation.demo_clock_runs (tenant_id, outcome, shift_days, rows_moved)
    VALUES (c.tenant_id, 'moved', v_shift, v_moved);
    v_out := v_out || jsonb_build_object('tenant', c.tenant_id, 'outcome', 'moved',
                                         'shift_days', v_shift, 'rows_moved', v_moved);
  END LOOP;

  RETURN v_out;
END;
$$;

COMMENT ON FUNCTION obligation.fn_demo_clock_roll() IS
  'BOR-117. Re-anchors the open obligations of each active obligation.demo_clock tenant so the reference rule reads its designed days-late. Idempotent; logs every run to obligation.demo_clock_runs.';

REVOKE ALL ON FUNCTION obligation.fn_demo_clock_roll() FROM PUBLIC;
REVOKE ALL ON FUNCTION obligation.fn_demo_clock_roll() FROM anon, authenticated;

-- The specimen tenant. The reference and its designed value are the ones the
-- 2026-09-07 migration used: "Annual HMDA data submission", 12 days late.
INSERT INTO obligation.demo_clock (tenant_id, reference_rule_key, reference_days_late, note)
VALUES ('6f361690-9876-43e8-b5bd-9bba6c44ae68', 'bw-hmda-annual', 12,
        'BorrowWorks specimen. Designed value from the demo story: Annual HMDA data submission, 12 days late.')
ON CONFLICT (tenant_id) DO NOTHING;

-- Nightly, a few minutes after the database's date changes (the views compute
-- against CURRENT_DATE, which is UTC here). cron.schedule with a name replaces
-- an existing job of that name, so applying this twice leaves one job.
SELECT cron.schedule('bw-demo-clock-nightly', '7 0 * * *', $cron$SELECT obligation.fn_demo_clock_roll();$cron$);

-- ── After applying: the first roll, and what it should show ─────────────────
--
--   SELECT obligation.fn_demo_clock_roll();
--   -- expected on 2026-10-03: [{"outcome":"moved","shift_days":26,"rows_moved":31, …}]
--   -- (31 = open instances of bw-% rules for the tenant on that day: 24 open + 6
--   --  amber + 1 open control instance. Both numbers move with the calendar.)
--
--   SELECT title, days_late FROM public.bw_v_program_items
--    WHERE tenant_id = '6f361690-9876-43e8-b5bd-9bba6c44ae68' AND days_late IS NOT NULL
--    ORDER BY days_late DESC;
--   -- expected, 8 rows: Annual HMDA data submission 12, W-9 on file 12, Annual risk
--   -- review 6, Access review — quarterly 4, Privileged access review 4, Vendor risk
--   -- assessment 3, Fair-lending review 2, Borrower complaint — servicing delay 1.
--   --
--   -- Those eight numbers are not a guess: on 2026-10-03 the same arithmetic was run
--   -- as a read-only SELECT against the live rows (shift 26, 31 rows, one reference
--   -- row) and produced exactly that list. Nothing was written to get it.
--
--   SELECT obligation.fn_demo_clock_roll();   -- again: "already_anchored"
--
-- ── To stop it ──────────────────────────────────────────────────────────────
--
--   UPDATE obligation.demo_clock SET active = false WHERE tenant_id = '6f361690-…';
--   -- or: SELECT cron.unschedule('bw-demo-clock-nightly');
