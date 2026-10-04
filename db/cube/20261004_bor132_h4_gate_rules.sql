-- BOR-132 (H4) — gate rules, the view the broker reads them through, and the
-- wall's check order. Picked up as COS-3360.
--
-- TARGET: the Cube data plane (iofslupbvedjzmfmkdvx).
-- APPLIED 2026-10-04 15:11Z as migration `bor132_h4_gate_rules` (Dave approved the
-- apply in session). This file is that SQL. Verified after: three bw-gate-% rows,
-- public.bw_v_gate_rules, fn_broker_write md5(prosrc) 52f4520bbe004352cc082362360616f5,
-- the guard present, zero obligation instances on a gate rule.
--
-- WHAT IS NOT IN IT, AND WHY. The rulings also asked for label/description on
-- vendor-soc2-remediation. The first apply carried that UPDATE and was REFUSED,
-- rolling the whole migration back:
--
--   RULE VERSION IMMUTABLE: rule_key=vendor-soc2-remediation version=1 body
--   changed (50b812d3… -> <NULL>) without a version bump.
--
-- content_hash is a GENERATED column, and in a BEFORE UPDATE trigger a generated
-- column on NEW is not computed yet — it reads NULL. So trg_rule_version_immutable
-- sees "hash changed" on EVERY update of this table, whatever column moved: the
-- table is append-only in practice, including for `active`. A label on that rule
-- therefore needs a version 2 row, and version 1 cannot be switched off beside
-- it. That is a decision (obligation.rule_change_decisions), not a data fill, and
-- it is reported on BOR-132 rather than improvised here.
--
-- BUILT ON THE RULINGS ON BOR-132 (2026-10-04; ruling 3 ratified the substitutions
-- and the guard and view below). Ruling 2 says "the schema wins
-- where it is a wall", and where a CHECK / NOT NULL refuses a ruled value, to
-- take the schema's nearest existing value and SAY SO. The substitutions:
--
--   ruled                      stored                     because
--   -------------------------  -------------------------  --------------------------------------
--   domain = 'GATE'            domain = 'CONTROL'         obligation_rules_domain_check has no
--                                                         'GATE'; a gate is an access control.
--                                                         Gates are found by KEY: bw-gate-%.
--   (no subject named)         template_ref = rule_key    one_subject requires exactly one of
--                                                         template_ref / control_ref. NOT
--                                                         control_ref: public.bw_v_controls lists
--                                                         every active rule that has one, and a
--                                                         gate is not a control that falls due.
--   step-sealed: no owner      owner_role = 'compliance'  NOT NULL; ruled in ruling 2 point 3.
--   condition as SQL text      condition as jsonb         ruled in ruling 2 point 4, verbatim.
--
-- No constraint is widened, no row is deleted, no member is granted anything.
--
-- THE GUARD (ratified, ruling 3 call 2) — obligation.fn_materialise_for_vendor.
-- It treats every active rule with a non-null condition as a vendor obligation,
-- and matches by "no clause in condition->'all' fails". A gate condition has no
-- 'all', so it matches VACUOUSLY: calling that function for any vendor would
-- have opened an obligation instance for each of the three gates (due in 30
-- days, on the board, on the calendar feed) — exactly what ruling 1 said a gate
-- must never read as. The guard added below (`AND r.condition ? 'all'`) changes
-- nothing for any row that exists today: the only rule with a condition is
-- vendor-soc2-remediation and it has 'all'. Nothing on the Cube calls the
-- function (no cron, no trigger, no other function) — the guard is for the seat
-- or the door that one day does.

-- ---------------------------------------------------------------- 1. guard --
-- Patched in place from its own live definition, so not one other character of
-- it is retyped here. Idempotent: a second run finds the guard and does nothing.
DO $guard$
DECLARE
  v_def text := pg_get_functiondef('obligation.fn_materialise_for_vendor(uuid)'::regprocedure);
  v_old text := 'AND r.condition IS NOT NULL';
  v_new text := 'AND r.condition IS NOT NULL' || E'\n'
             || '      -- BOR-132: only an obligation condition has clauses to match. A gate rule' || E'\n'
             || '      -- (bw-gate-%) has none, and must not match vacuously.' || E'\n'
             || '      AND r.condition ? ''all''';
BEGIN
  IF position('r.condition ? ''all''' IN v_def) > 0 THEN
    RETURN;
  END IF;
  IF position(v_old IN v_def) = 0 THEN
    RAISE EXCEPTION 'BOR-132: fn_materialise_for_vendor no longer contains the line this guard attaches to; read it before applying.';
  END IF;
  EXECUTE replace(v_def, v_old, v_new);
END
$guard$;

-- ------------------------------------------------------------ 2. gate rows --
-- label / description are the ruling's words, verbatim. They are what a refusal
-- shows and what a compliance officer reads; they live here and nowhere else.
-- `condition` is inside content_hash, so version 1 is frozen by
-- trg_rule_version_immutable: a rewording of the CONDITION is a new version row.
INSERT INTO obligation.obligation_rules
  (tenant_id, rule_key, template_ref, owner_role, domain, version, condition, label, description)
VALUES
  ('6f361690-9876-43e8-b5bd-9bba6c44ae68', 'bw-gate-step-sealed', 'bw-gate-step-sealed',
   'compliance', 'CONTROL', 1,
   '{"kind":"sealed","source":"vendor_facts.value.sealed"}'::jsonb,
   'This step is sealed.',
   'A sealed checklist step is part of the record and cannot be changed. To correct it, add a new step that supersedes it; the original stays.'),
  ('6f361690-9876-43e8-b5bd-9bba6c44ae68', 'bw-gate-vendor-step-write', 'bw-gate-vendor-step-write',
   'vendor-risk', 'CONTROL', 1,
   '{"kind":"role","role":"vendor-risk"}'::jsonb,
   'Vendor-risk role required.',
   'Only a member holding the vendor-risk role can change a vendor checklist step. Ask your administrator for the role; the attempt has been recorded.'),
  ('6f361690-9876-43e8-b5bd-9bba6c44ae68', 'bw-gate-flagged-decision-signoff', 'bw-gate-flagged-decision-signoff',
   'Risk', 'CONTROL', 1,
   '{"kind":"role_and_flag","role":"Risk","flag":"flagged"}'::jsonb,
   'Risk sign-off required on a flagged decision.',
   'This decision is flagged for fair-lending review. Only a member holding the Risk role can sign it off. The attempt has been recorded.')
ON CONFLICT (tenant_id, rule_key, version) DO NOTHING;

-- ------------------------------------------------- 4. how the broker reads --
-- The broker's credential cannot read schema `obligation` (no USAGE, no SELECT),
-- and that is left alone. It reads gates through this view, the same way it
-- reads every other bw_v_* surface: the current version of each active gate
-- rule, and nothing that is not a gate.
--
-- NOT security_invoker, on purpose: the invoker has no rights on the table. The
-- view is the grant, and it is narrow — six columns, gate rows only. Tenant
-- scoping is the broker's filter, re-checked on the rows, as on every read.
CREATE OR REPLACE VIEW public.bw_v_gate_rules AS
SELECT DISTINCT ON (r.tenant_id, r.rule_key)
       r.tenant_id,
       r.rule_key,
       r.version,
       r.label,
       r.description,
       r.owner_role,
       r.condition
  FROM obligation.obligation_rules r
 WHERE r.active
   AND r.rule_key LIKE 'bw-gate-%'
 ORDER BY r.tenant_id, r.rule_key, r.version DESC;

COMMENT ON VIEW public.bw_v_gate_rules IS
  'BOR-132. The current version of each active gate rule (rule_key bw-gate-%). Read by the broker for the can route and for the words on a refusal; one wording, one place.';

REVOKE ALL ON public.bw_v_gate_rules FROM PUBLIC;
REVOKE ALL ON public.bw_v_gate_rules FROM anon, authenticated;
GRANT SELECT ON public.bw_v_gate_rules TO service_role;

-- ------------------------------------------- 5. the wall: sealed before role --
-- The whole function, restated from db/cube/20261002_bor130_fn_broker_write.sql
-- with ONE change: the order of the two checks. Signature, codes, evidence row,
-- grants — all as built.
CREATE OR REPLACE FUNCTION lending.fn_broker_write(
  p_tenant       uuid,
  p_actor        text,
  p_entitlements text[],
  p_required     text,
  p_resource     text,
  p_action       text,
  p_id           jsonb,
  p_values       jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = lending, public, pg_temp
AS $$
DECLARE
  v_vendor   uuid;
  v_fact_key text;
  v_fact     lending.vendor_facts%ROWTYPE;
  v_before   jsonb;
  v_after    jsonb;
  v_patch    jsonb := '{}'::jsonb;
  v_book     uuid;
  v_books    integer;
  v_path     text;
  v_code     text;
  v_change   uuid;
BEGIN
  -- Facts the broker must have supplied. Missing means the caller is not the
  -- broker, or the broker is broken; either way nothing is written.
  IF p_tenant IS NULL OR coalesce(btrim(p_actor), '') = '' OR coalesce(p_required, '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'bad_request');
  END IF;

  -- One resource, one verb. A second writable resource is a second branch here
  -- AND a second row in the broker's write allowlist — both, or it does not open.
  IF p_resource IS DISTINCT FROM 'lending_vendor_checklist' OR p_action IS DISTINCT FROM 'update' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'write_not_allowed');
  END IF;

  BEGIN
    v_vendor := (p_id ->> 'vendor_id')::uuid;
  EXCEPTION WHEN others THEN
    RETURN jsonb_build_object('ok', false, 'code', 'bad_id');
  END;
  v_fact_key := p_id ->> 'fact_key';
  IF v_vendor IS NULL OR coalesce(v_fact_key, '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'bad_id');
  END IF;

  IF p_values ? 'status' THEN
    v_patch := v_patch || jsonb_build_object('status', p_values ->> 'status');
  END IF;
  IF p_values ? 'detail' THEN
    v_patch := v_patch || jsonb_build_object('detail', p_values ->> 'detail');
  END IF;
  IF v_patch = '{}'::jsonb THEN
    RETURN jsonb_build_object('ok', false, 'code', 'bad_field');
  END IF;

  -- The step, under the tenant. Locked, so two writers cannot both read the same
  -- before_state. A vendor in another tenant resolves to nothing here.
  SELECT f.* INTO v_fact
    FROM lending.vendor_facts f
   WHERE f.tenant_id = p_tenant
     AND f.vendor_id = v_vendor
     AND f.fact_key  = v_fact_key
     AND f.value ? 'status'
   ORDER BY f.recorded_at DESC
   LIMIT 1
   FOR UPDATE;

  IF NOT FOUND THEN
    -- No evidence row: there is no step, and so no path, to file it against.
    RETURN jsonb_build_object('ok', false, 'code', 'not_found');
  END IF;

  v_before := v_fact.value;
  v_path   := 'vendors/' || v_vendor::text || '/' || v_fact_key;

  -- Where the evidence row is filed. See the header note on book_id.
  SELECT count(*), min(b.id::text)::uuid INTO v_books, v_book
    FROM lending.books b
   WHERE b.tenant_id = p_tenant;
  IF v_books = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'no_book');
  ELSIF v_books > 1 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'book_ambiguous');
  END IF;

  -- THE CHECKS. First refusal wins; each is a code the surface can show.
  --
  -- SEALED BEFORE ROLE (BOR-132, ruling 2 point 5a). A sealed step refuses the
  -- same way for everyone: whether the caller holds the role is not something a
  -- sealed step should reveal, and the answer to "can this be changed" is no
  -- before it is "not by you". The broker maps each code to its rule row
  -- (step_sealed -> bw-gate-step-sealed, role_required -> the role gate bound to
  -- this resource/action) — the codes themselves are unchanged.
  IF coalesce((v_before ->> 'sealed')::boolean, false) THEN
    v_code := 'step_sealed';
  ELSIF NOT (coalesce(p_entitlements, '{}') && ARRAY['*', p_required]) THEN
    v_code := 'role_required';
  END IF;

  IF v_code IS NOT NULL THEN
    INSERT INTO lending.evidence_changes
      (book_id, tenant_id, path, intent, author, author_kind, reasoning, before_state, after_state, status)
    VALUES
      (v_book, p_tenant, v_path, p_action, p_actor, 'human', v_code, v_before, v_patch, 'refused')
    RETURNING id INTO v_change;

    RETURN jsonb_build_object('ok', false, 'code', v_code, 'change_id', v_change);
  END IF;

  -- THE WRITE. recorded_at is left alone on purpose: the checklist view orders
  -- on it, and a step that jumped position because someone touched it would be
  -- the surface misreporting the record.
  UPDATE lending.vendor_facts f
     SET value = f.value
                 || v_patch
                 || jsonb_build_object('updated_by', p_actor, 'updated_at', to_jsonb(now()))
   WHERE f.id = v_fact.id
     AND f.tenant_id = p_tenant
  RETURNING f.value INTO v_after;

  INSERT INTO lending.evidence_changes
    (book_id, tenant_id, path, intent, author, author_kind, reasoning, before_state, after_state, status)
  VALUES
    (v_book, p_tenant, v_path, p_action, p_actor, 'human', NULL, v_before, v_after, 'applied')
  RETURNING id INTO v_change;

  -- The row, in the shape public.bw_v_vendor_checklist returns it, so the
  -- surface can replace the step it is showing without a second read.
  RETURN jsonb_build_object(
    'ok', true,
    'change_id', v_change,
    'row', jsonb_build_object(
      'tenant_id',   v_fact.tenant_id,
      'vendor_id',   v_fact.vendor_id::text,
      'title',       coalesce(v_after ->> 'title', initcap(replace(v_fact.fact_key, '_', ' '))),
      'status',      coalesce(v_after ->> 'status', 'NOT STARTED'),
      'sealed',      coalesce((v_after ->> 'sealed')::boolean, false),
      'detail',      v_after ->> 'detail',
      'fact_key',    v_fact.fact_key,
      'recorded_at', v_fact.recorded_at
    )
  );
END;
$$;

COMMENT ON FUNCTION lending.fn_broker_write(uuid, text, text[], text, text, text, jsonb, jsonb) IS
  'BOR-130/BOR-133/BOR-132. The broker''s write wall: check (sealed, then role), write and evidence in one transaction. Refusals return {ok:false, code} and are recorded; they never raise.';

-- Nobody reaches this but the broker. PUBLIC first: functions are EXECUTE-to-all
-- by default, and that default is the hole.
REVOKE ALL ON FUNCTION lending.fn_broker_write(uuid, text, text[], text, text, text, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION lending.fn_broker_write(uuid, text, text[], text, text, text, jsonb, jsonb) FROM anon, authenticated;
-- Unchanged from BOR-130: the role the broker's Cube credential resolves to.
GRANT EXECUTE ON FUNCTION lending.fn_broker_write(uuid, text, text[], text, text, text, jsonb, jsonb) TO service_role;
