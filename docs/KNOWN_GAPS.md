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

## Legal data panels: two honest limits, both surfaced in the UI

The six panels (Parties, Rates, Savings, Subpoenas, Claim value, Recovery outlook)
read `legal.ld_*` on the cube store and are registered in
`src/config/lawdog.config.json`. Two of them cannot be narrowed to the selected
matter, and each says so on its own face rather than pretending otherwise:

- **Rates** — `ld_rate_card` is tenant-level and carries **no `case_id`**. Adding a
  case filter would 400, not narrow. Row security scopes the read. The panel notes
  that rates apply across the workspace.
- **Claim value** — `ld_claim_math` keys on **`claim_id`, not `case_id`**. It is
  fetched tenant-wide and grouped by claim. Narrowing to a matter needs a
  claim→case join, which lands when `ld_claims` is wired; the fetcher carries that
  note (`LawDogProvider.listClaimMath`).

**Empty is the expected state outside a session** — same auth reality as above: no
anon grant, no anonymous read path. Dev and preview render every panel empty by
design.

**Fixture harness:** `panels.html` → `src/panels-preview.tsx` renders all six
panels populated and empty, side by side, from raw fixture rows
(`src/data/lawdog-fixtures.ts`) shaped exactly like the live column lists and run
through the same row mappers the provider uses. It covers the shapes that break
panels: unknown status and priority values (neutral fallback pill), null numerics
and dates, and both array-shaped and object-shaped `jsonb`. Run `npm run dev` and
open `/panels.html`.

## OAuth: implicit flow retired, PKCE live (2026-08-09)

**Implicit is gone.** It is what caused the 2026-08-09 incident: a production
sign-in redirected to a stale dev host and carried `access_token`,
`provider_token` and `refresh_token` in the URL **fragment** — three secrets in
the address bar of a host the operator did not control. No new sign-in can take
that path; `signInWithProvider()` requests `flow_type=pkce` unconditionally, for
both Google and Microsoft.

**PKCE is the only path for new sign-ins.** `signInWithProvider()` generates an
86-char base64url `code_verifier` (`crypto.getRandomValues`, inside RFC 7636's
43–128 range), derives an S256 `code_challenge` via WebCrypto `subtle.digest`,
stashes the verifier in **sessionStorage** (`lawdog.pkce_verifier` — single-use,
must not outlive the tab), and redirects to `/auth/v1/authorize` with
`code_challenge` / `code_challenge_method=s256`. The provider comes back with a
one-time `?code=` in the **query string**, which `completeOAuthRedirect()`
exchanges at `/auth/v1/token?grant_type=pkce` (`{auth_code, code_verifier}`, anon
key as `apikey`). An intercepted code is inert without the verifier. The code is
stripped from the URL via `history.replaceState` **before** the exchange fires,
so it never survives in history whether or not the exchange succeeds, and the
verifier is removed from sessionStorage on every path including failure.

Sessions still land in `localStorage` under `lawdog.session`, unchanged — same
store the password sign-in writes, so `getAccessToken()` and the provider needed
no edits.

**Fragment fallback — sunset after one release.** `consumeOAuthRedirect()` is
kept, unchanged and exported, purely to catch a redirect that was already in
flight at the moment of the cutover (an operator who clicked "Continue with
Google" against the old build). It is dead weight otherwise. **Delete
`consumeOAuthRedirect()` and its call inside `exchangePkceCode()` in the release
after the PKCE cutover.**

**Still dashboard-side, out of scope here:** `redirect_to` is
`window.location.origin`, correct on prod, the vercel alias and localhost alike.
Which origins are actually honoured is governed by the Supabase URL allowlist —
the stale dev host should be pruned from that allowlist independently of this
change.

Historical note: the Bolt export shipped this flow as `src/data/lawdog-auth-oauth.ts`,
a paste-in snippet that referenced symbols private to `lawdog-auth.ts`, had zero
importers, and was the only file failing `tsc`. It was removed in the landing PR;
the flow now lives in `lawdog-auth.ts` proper.

**Default profile is unaffected.** With `VITE_PROFILE` unset the app loads the
non-lawdog `workspace` profile on mock data (`src/config/index.ts`,
`src/config/workspace.config.json` → `data.mode: "mock"`), which builds and runs
normally.
