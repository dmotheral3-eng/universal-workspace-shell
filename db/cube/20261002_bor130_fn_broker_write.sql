-- BOR-130 (H2) — the wall behind the broker's write door.
-- BOR-133 (H5) — the evidence row, written in the SAME transaction.
--
-- TARGET: the Cube data plane (the project behind CUBE_URL), schema `lending`.
--
-- STATUS WHEN THIS FILE WAS WRITTEN: NOT APPLIED, AND NOT RUN AGAINST THE CUBE.
-- It was written from a schema read (lending.vendor_facts, lending.evidence_changes,
-- public.bw_v_vendor_checklist, their constraints and triggers) and has not been
-- executed. Apply it on a branch or inside BEGIN … ROLLBACK first. Until it is
-- applied, POST /api/cube/lending_vendor_checklist answers 502 `upstream_error`:
-- the door is shut, which is the safe direction.
--
-- WHAT IT IS. One function, one transaction: check → write → record. The broker
-- (server/broker/write.ts) proves who is calling and which tenant they are in,
-- then hands those FACTS here. Whether the change is allowed is decided in this
-- function, and both outcomes leave a row in lending.evidence_changes:
--
--   allowed  → vendor_facts.value updated, evidence status 'applied' with
--              before_state / after_state
--   refused  → nothing changes, evidence status 'refused' with the code in
--              `reasoning` and the attempted values in after_state
--
-- A refusal RETURNS; it does not RAISE. An exception would roll the evidence row
-- back with everything else, and a refused attempt that leaves no record is the
-- thing this is here to prevent.
--
-- TWO THINGS THE TICKET ASKED FOR THAT THIS DOES NOT DO, STATED RATHER THAN HIDDEN:
--
-- 1. "RLS on, via the tenant's role, never service key." The people who sign in
--    are MASTER users; the Cube's row policies key on the Cube's own auth.uid()
--    through public.tenant_members, and the only write policy on lending.* is
--    is_admin(). A master user has no Cube identity for a policy to match. So the
--    tenant predicate is enforced HERE, in the function body (every statement is
--    `WHERE tenant_id = p_tenant`), and the function is SECURITY DEFINER with
--    EXECUTE revoked from everyone but the broker's role. That is a wall, but it
--    is a function wall, not a row-policy wall. Making it a row-policy wall needs
--    either Cube identities for master users or a signing key for per-request
--    Cube tokens — neither exists today, and both are decisions, not code.
--
-- 2. THE GRANT AT THE BOTTOM IS A GUESS. It grants EXECUTE to service_role
--    because the existing broker calls lending.fn_meter_app_action with the same
--    credential. If CUBE_BROKER_KEY resolves to a different role, change that one
--    line; nothing else here depends on it.
--
-- evidence_changes.book_id is NOT NULL, but a vendor is a tenant-level
-- counterparty with no book. The row is filed under the tenant's book when the
-- tenant has exactly one; a tenant with several books and a vendor write is
-- refused `book_ambiguous` rather than filed under a book picked by sort order.

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
  IF NOT (coalesce(p_entitlements, '{}') && ARRAY['*', p_required]) THEN
    v_code := 'role_required';
  ELSIF coalesce((v_before ->> 'sealed')::boolean, false) THEN
    v_code := 'step_sealed';
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
  'BOR-130/BOR-133. The broker''s write wall: check, write and evidence in one transaction. Refusals return {ok:false, code} and are recorded; they never raise.';

-- Nobody reaches this but the broker. PUBLIC first: functions are EXECUTE-to-all
-- by default, and that default is the hole.
REVOKE ALL ON FUNCTION lending.fn_broker_write(uuid, text, text[], text, text, text, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION lending.fn_broker_write(uuid, text, text[], text, text, text, jsonb, jsonb) FROM anon, authenticated;
-- SEE HEADER NOTE 2 — confirm this is the role CUBE_BROKER_KEY resolves to.
GRANT EXECUTE ON FUNCTION lending.fn_broker_write(uuid, text, text[], text, text, text, jsonb, jsonb) TO service_role;
