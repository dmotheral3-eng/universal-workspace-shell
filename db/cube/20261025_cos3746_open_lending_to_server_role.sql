-- COS-3746, second blocker behind the broker key. APPLIED to the Cube (iofslupbvedjzmfmkdvx)
-- on 2026-10-25 by a Claude seat on Dave's word: "Open it to the server only" / "You (Claude) apply it now".
-- Dry run (BEGIN … ROLLBACK) passed first. anon still has no USAGE on lending; authenticated keeps
-- only the RLS-scoped (tenant-membership) grants it already had.
grant usage on schema lending to service_role;
grant select on lending.books, lending.view_registry, lending.evidence_decisions, lending.evidence_interactions,
                lending.evidence_changes, lending.evidence_attestations, lending.decision_log to service_role;
grant insert on lending.decision_log to service_role;
grant usage on all sequences in schema lending to service_role;
do $$ declare r record; begin
  for r in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='lending' and p.proname in ('fn_broker_write','fn_meter_app_action') loop
    execute format('grant execute on function %s to service_role', r.sig);
  end loop; end $$;
alter role authenticator set pgrst.db_schemas = 'public, graphql_public, legal, lending';
notify pgrst, 'reload config';
