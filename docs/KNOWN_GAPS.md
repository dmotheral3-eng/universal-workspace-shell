# Known Gaps

## Law Dog profile: provider column map FIXED — remaining gap is auth-only

The `lawdog` profile serves schema **`legal`** on `aryjtzlawkbazvqsjozf`
(`data.lawdog.store: "cube"` → `Accept-Profile: legal`). This target is intentional
per the ROM ruling of 2026-08-06: the Law Dog product surface serves `legal` on that
project and must **never** serve schema `public` there — `public` holds Dave-personal
litigation and is the named carve-out exception.

The provider's `legal`/cube branch previously read `public`-shaped columns and could
not return a usable row. That is **closed** as of the provider column-map PR
(store-conditional mapping: `case_id` vs `id`, `actor` vs `who`,
`provenance_ref/_kind/_note` vs `evidence_source`, `status`-based document posture vs
the `completeness` family, which does not exist on `legal.ld_documents`).

**What still gates a deploy — auth, by design, not a defect:** `anon` has no grant on
any `legal.ld_*` table (verified live 2026-08-06). With a bare anon key the cube store
returns zero rows. Reads work only through an authenticated GoTrue session
(`src/data/lawdog-auth.ts`). Live-row verification therefore happens in the deployed
app behind sign-in, not in CI. Do not "fix" empty results by adding anon policies or
touching the database.

**Mapping verification:** the pure mappers (`rowCaseId`, `rowActor`, `rowProvenance`,
`docIsSettled`) are exported from `src/data/lawdog-provider.ts` and were verified
against fixture rows shaped exactly like the live `information_schema` column lists
(both stores, 13 assertions, OS-side). A repo-resident CI test is owed once the
dispatch rail (and any test runner) is installed on this repo.

## OAuth snippet removed from the initial landing

The Bolt export shipped `src/data/lawdog-auth-oauth.ts` as a compilable `.ts` file,
but its own header declared it a paste-in snippet ("OAuth additions for
`src/data/lawdog-auth.ts` — append these to the existing module"). It referenced
symbols private to `lawdog-auth.ts` (`requireCfg`, `LawDogSession`, `store`), had
**zero importers**, and was the only file that failed `tsc`. It was removed in the
landing PR so the tree builds. The Google/Azure OAuth flow it documents
(`signInWithProvider`, `consumeOAuthRedirect`) is **not yet integrated** and should be
folded into `lawdog-auth.ts` properly in a follow-on PR.

**Default profile is unaffected.** With `VITE_PROFILE` unset the app loads the
non-lawdog `workspace` profile on mock data (`src/config/index.ts`,
`src/config/workspace.config.json` → `data.mode: "mock"`), which builds and runs
normally.
