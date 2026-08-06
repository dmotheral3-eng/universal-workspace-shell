# Known Gaps

## Law Dog profile is NOT deployable yet (provider does not read the `legal` schema correctly)

The `lawdog` profile is configured to serve schema **`legal`** on
`aryjtzlawkbazvqsjozf` (config `src/config/lawdog.config.json` →
`data.mode: "lawdog-cube"`, `data.lawdog.store: "cube"`, which makes the provider
send `Accept-Profile: legal`). This target is intentional per the ROM ruling of
2026-08-06: the Law Dog product surface serves `legal` on that project and must
**never** serve schema `public` there — `public` holds Dave-personal litigation and
is the named carve-out exception.

However, the provider's `legal` / cube branch is **known broken** and is fixed in a
separate follow-on PR. Until that lands, the `lawdog` profile is not deployable.
The provider (`src/data/lawdog-provider.ts`) still reads the `public`/case column
and table shapes, which do not match the `legal` schema:

- **key column**: provider filters/reads `case_id` where the `legal` schema uses `id`.
- **actor column**: provider reads `who` where the `legal` schema uses `actor`.
- **provenance column**: provider reads `evidence_source` where the `legal` schema
  uses `provenance_ref`.
- **completeness / source columns do not exist** in the `legal` schema, so the
  Provenance section and the coverage/authenticity signal have no backing columns.

Because of this, the `lawdog` profile must not be shipped or pointed at production
until the follow-on provider PR reconciles these column and table differences.

## OAuth snippet removed from this landing

The Bolt export shipped `src/data/lawdog-auth-oauth.ts` as a compilable `.ts` file,
but its own header declared it a paste-in snippet ("OAuth additions for
`src/data/lawdog-auth.ts` — append these to the existing module"). It referenced
symbols private to `lawdog-auth.ts` (`requireCfg`, `LawDogSession`, `store`), had
**zero importers**, and was the only file that failed `tsc`. It was removed in this
PR so the tree builds. The Google/Azure OAuth flow it documents (`signInWithProvider`,
`consumeOAuthRedirect`) is **not yet integrated** and should be folded into
`lawdog-auth.ts` properly in the same follow-on PR that fixes the `legal`-schema
provider.

**Default profile is unaffected.** With `VITE_PROFILE` unset the app loads the
non-lawdog `workspace` profile on mock data (`src/config/index.ts`,
`src/config/workspace.config.json` → `data.mode: "mock"`), which builds and runs
normally.
