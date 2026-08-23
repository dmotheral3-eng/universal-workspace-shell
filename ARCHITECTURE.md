# Architecture

## The door: shell = identity, master = auth home, Cube = data plane

Ruled 2026-08-11. Cube-backed app surfaces sign in through the universal
shell's existing master-auth door rather than each app wiring its own Cube
auth.

```
  browser
    │  ① sign in (PKCE, Google or Microsoft)
    ▼
  MASTER  ulzyudbqkmjistymlqwg  ·  app.centripetal-ai.com
    │      both providers live-green 2026-08-11
    │  ② session (access token in the browser)
    ▼
  SHELL   this repo — the identity layer and the only door
    │      /api/cube/*  server-side broker
    │      ③ verify the session against master
    │      ④ resolve tenant + entitlements from the shell's own tables
    │      ⑤ read, with a scoped credential and a tenant filter
    ▼
  CUBE    iofslupbvedjzmfmkdvx  ·  data plane, no user auth of its own
```

Three roles, and they do not overlap:

- **Shell — identity.** Owns the sign-in surface and the only server code that
  can reach the Cube. A browser holding a shell page can ask for *rows*; it can
  never ask for a *table*.
- **Master — auth home.** The only judge of whether a session is real. Google
  and Microsoft are both already configured there, with callbacks and secrets
  done. Nothing in this change touches master's provider config, and nothing
  should: that is the entire reason this route was chosen.
- **Cube — data plane.** Holds rows. Has no idea who the user is, and is never
  told. It sees a scoped server credential and a tenant-filtered query.

### Why this and not native Cube auth per app

The Cube has Google native (live 2026-08-11) and Microsoft still awaiting a
console errand. Wiring each app's own Cube auth means doing that errand once per
app, then owning a second set of callbacks, a second set of secrets, and a
second sign-in surface to keep correct. Routing through master gives every Cube
surface **both** buttons immediately, with zero further provider work, and one
uniform door from here on. Reuse-first (identity doctrine law #2).

### What the broker actually does

`server/broker/handler.ts` — framework-free, so it is tested without a running
platform. `api/cube/[...path].ts` is the Vercel adapter;
`server/dev-broker-plugin.ts` mounts the same handler on the dev server so the
path can be exercised locally.

Order of operations is the security model. Each step refuses before the next can
spend anything:

1. **GET only.** Writes are not part of this surface.
2. **Resource allowlist** (`server/broker/resources.ts`). `/api/cube/<name>`
   resolves to a named table, a fixed column list, a fixed order, a row ceiling
   and a set of allowlisted filters — or it 404s. The caller's query string
   supplies *values*, never a key, column, table or operator. Checked before
   authentication, so a valid session cannot enumerate the surface.
3. **Bearer present.** Anonymous stops here, having contacted nothing at all.
4. **Master verifies the token** (`/auth/v1/user`). A locally decoded JWT is not
   verification — signature, expiry and revocation all live upstream.
5. **Tenant + entitlements** come from the shell's own table on master, read
   with the *caller's own token*, so master's row security does the scoping and
   the broker needs no second master secret. No row, a null tenant, or several
   tenants with no explicit pick all end in a refusal. **There is no default
   tenant.**
6. **Entitlement per resource.** Absent means no.
7. **The Cube read** — the one call that uses the Cube credential. The tenant
   filter is applied here, by the broker.
8. **Rows re-checked** against the resolved tenant on the way out. The filter
   going up should make a foreign row impossible; if it ever does not, the rows
   still do not leave the function.

Refusals carry a code and nothing else. Upstream status text, table names,
schemas and hostnames stay server-side (P#183 — the server shields everything).

### Secrets

Server-only, set by hand in the Vercel project (identity doctrine law #4 —
secrets are Dave-hands-only, never in this repo):

| Variable | What it is |
| --- | --- |
| `CUBE_URL` | Cube project URL. Never reaches a browser. |
| `CUBE_BROKER_KEY` | Scoped Cube credential. Never reaches a browser. |
| `MASTER_URL` / `MASTER_ANON_KEY` | Used server-side to verify sessions. |
| `SHELL_MEMBERSHIP_TABLE` | Optional; defaults to `shell_tenant_members`. |

**No Cube variable may ever be given a `VITE_` prefix.** Vite inlines every
`VITE_*` value into the client bundle at build time. `readBrokerEnv()` refuses to
boot if a server secret is also published under a `VITE_` name, and
`test/bundle-secrets.test.ts` builds the client with a sentinel credential in the
environment and greps every emitted byte for it.

Client-side, and public by design: `VITE_MASTER_URL` and `VITE_MASTER_ANON_KEY`
— an anon key is what accompanies a user's own JWT. `service_role` appears
nowhere, in any bundle, ever.

### The shell's tenancy table

On master, read with the user's own token. The broker expects:

```
shell_tenant_members
  user_id      uuid    -- auth.users.id
  tenant_id    uuid
  entitlements text[]  -- e.g. {legal.rates}; "*" for an operator row
  status       text    -- only "active" is honoured
```

RLS must restrict a user to their own rows — the broker relies on it rather than
holding a second master secret.

### Proof surface

The **Rates** panel (`src/panels/legal/rates.tsx`), on `VITE_PROFILE=cube`. It is
the honest test of the broker: the rate card is tenant-level and carries no
`case_id`, so tenant scoping is the only thing separating one workspace's rates
from another's. The same panel renders identically through either door — the
brokered rows go through `mapRateRow`, the same mapper the native provider uses.

A panel opts into the brokered door one at a time, by supplying `brokerLoad` to
`useLegalData`. A panel without one is simply unavailable on the cube profile.

### Native Cube auth is not retired

Apps that already authenticate to their own project directly keep doing so.
**`lawdog-app` stays on `aryjtz` native and is out of scope** — untouched by this
change. In this repo the `lawdog` profile likewise keeps its own door and its own
provider; `getAuthConfig()` returns it, and its session, storage key and PKCE
verifier key are all unchanged.

One naming trap, because it has bitten before: the Law Dog provider's
`store: "cube"` means *schema `legal` on `aryjtz`* and has nothing to do with the
Cube in this document. The token kept its name when the legal estate consolidated
on 2026-08-05 (see `src/data/lawdog-provider.ts`). Different project, different
door.

### Profiles

| `VITE_PROFILE` | Door | Data |
| --- | --- | --- |
| *(unset)* | none | mock |
| `lawdog` | Law Dog's own project (native) | provider → `aryjtz`, schema `legal` |
| `cube` | **master** | `/api/cube/*` → Cube, server broker |

### Tests

`npm test` (vitest):

- `server/broker/handler.test.ts` — anonymous refused, forged token refused,
  unresolved tenant refused, unentitled refused, unknown resource 404, writes
  405; a master-session user sees only their own tenant's rows; a caller cannot
  choose the tenant, the columns or the row count; refusals leak nothing.
- `src/data/cube-broker.test.ts` — the client carries the master session to a
  same-origin path and holds no credential of its own.
- `test/bundle-secrets.test.ts` — bundle grep, with the public anon key as the
  control that proves the grep is looking at real output.

## The where-are-we ladder: `/api/whereweare`

A second server route, built to the same shape as the Cube broker and for the same
reason: the browser is told numbers, never told where they came from.

```
  browser (signed in through master, as everywhere else)
    │  GET /api/whereweare  + the user's own bearer
    ▼
  SHELL   server/whereweare/handler.ts
    │  ① GET only
    │  ② bearer present — anonymous stops here, having contacted nothing
    │  ③ master verifies the token (/auth/v1/user)
    │  ④ ladder registry read from master WITH THE CALLER'S OWN TOKEN,
    │     so master's RLS does the scoping and this route holds no master secret
    │  ⑤ per-ladder source read with a server-only credential
    ▼
  COUNTS AND CLOCKS ONLY
```

**The ladder is data, not code.** `public.whereweare_ladder` on master holds one row
per stage per vertical/client: the stage sequence, key, label and hint, the project
ref and view that hold the truth, the column to count by, and — additively — the
movement log and denominator metric to read. Registering a new vertical is an
`INSERT`. Nothing in this repo names a stage, a client, or a project ref.

**Attestation crosses the tenant wall; rows do not.** The response carries stage
counts, a total, a `last_moved_at`, a stall age and a denominator. It carries no
owner name, account number or amount. The source read asks for the stage column
alone, so identifying columns are never even fetched — `server/whereweare/handler.test.ts`
asserts both halves, using a fixture that really does carry owner names.

**The stall clock is the point.** `last_moved_at` is the newest pulse sample whose
*substantive* metrics differ from the sample before it. Keys beginning `mins_since`
are excluded by name: they tick upward on every sample by construction, so counting
them would report a pipeline that has not moved in sixteen hours as having moved
seconds ago. That is the exact defect this route was built to end. A vertical with
no pulse log gets `last_moved_at: null` and renders AMBER "no movement instrument" —
never a fabricated timestamp.

**A blank never passes for a fact.** A source with no configured credential returns
`note: "no_source_credential"` and NULL counts, rendered RED — not zero. A vertical
in `public.v_whereweare_scope` with no registered ladder renders RED as "no ladder
registered". Missing capability is discovered by looking at the board.

| Variable | What it is |
| --- | --- |
| `MASTER_URL` / `MASTER_ANON_KEY` | Already required by the Cube broker; reused, not duplicated. |
| `WHEREWEARE_SOURCE_KEYS` | JSON `{"<project_ref>":"<key>"}`. Server-only. Absent is legal and renders RED; malformed is refused at boot rather than silently degrading to `{}`. |

The board is registered on the **operator** profile only. It shows counts across
verticals and clients, so putting it on a client-facing profile would place one
tenant's pipeline in front of another's user — `src/config/profile.test.ts` pins the
client profiles' panel sets and will fail if that is ever undone.
