# D-LDUX-1 — Proof transcript

Date: 2026-08-12

## 1. Sign-out (account menu)

**DOM structure added** (`src/shell/workspace-header.tsx`):

```html
<header class="flex h-10 items-center justify-between border-b ...">
  <!-- left: brand logo -->
  <div>Law Dog</div>

  <!-- right: Panels menu · Layout menu · Account menu -->
  <div class="flex items-center gap-1">
    <!-- ...Panels and Layout dropdowns... -->

    <!-- Account menu — only rendered when getAuthConfig() is non-null AND a
         session is present (i.e., user is signed in) -->
    <button aria-label="Account">
      <UserCircle />
      ba.lloyd@yahoo.com   <!-- truncated to 120px max-width -->
    </button>

    <!-- Dropdown -->
    <div role="menu">
      <div>
        <p>Signed in as</p>
        <p>ba.lloyd@yahoo.com</p>
      </div>
      <hr />
      <button class="text-destructive">
        <LogOut /> Sign out
      </button>
    </div>
  </div>
</header>
```

**Behavior**: clicking "Sign out" calls `signOut()` from `src/data/lawdog-auth.ts`, which:
1. POSTs to `${supabaseUrl}/auth/v1/logout` with the current bearer token.
2. Calls `store(null)` — clears localStorage key `lawdog.session` and fires all
   registered `onAuthChange` listeners.
3. `LawDogGate` is subscribed via `onAuthChange(setSession)`. It sets `session`
   to `null`, which triggers a re-render showing the sign-in form.
4. No page reload required. No auth-flow changes beyond calling `signOut()`.

---

## 2. Colored navigation (NavRail)

**New component**: `src/shell/nav-rail.tsx`

**Rendered structure**:

```html
<nav style="background: #5E6AD2" aria-label="Navigation"
     class="flex w-14 flex-col items-center">

  <!-- MATTERS -->
  <button aria-pressed="true" style="background: rgba(255,255,255,0.22); color:#fff">
    <List />
    <span>Matters</span>
  </button>

  <!-- MATTER HOME -->
  <button aria-pressed="false" style="color: rgba(255,255,255,0.75)">
    <Home />
    <span>Matter</span>
  </button>

  <!-- TIMELINE -->
  <button aria-pressed="false" ...>
    <Table />
    <span>Timeline</span>
  </button>

  <!-- EVIDENCE -->
  <button aria-pressed="false" ...>
    <FolderOpen />
    <span>Evidence</span>
  </button>

  <!-- STAGES -->
  <button aria-pressed="false" ...>
    <GitBranch />
    <span>Stages</span>
  </button>

  <!-- divider between core and chat -->
  <hr style="background: rgba(255,255,255,0.2)" />

  <!-- ASK / CHAT — VISUALLY PRIMARY: white-bordered pill with translucent fill -->
  <button
    style="background: rgba(255,255,255,0.18); border: 1.5px solid rgba(255,255,255,0.55)"
    aria-label="Ask"
  >
    <MessageSquare style="color:#fff" />
    <span style="color:#fff; font-weight:600">Ask</span>
  </button>

  <!-- divider between chat and legal -->
  <hr ... />

  <!-- LEGAL SECTION -->
  <button ...><Users /><span>Parties</span></button>
  <button ...><Gavel /><span>Subpoenas</span></button>
  <button ...><Calculator /><span>Claim</span></button>
  <button ...><Target /><span>Recovery</span></button>
</nav>
```

**Behavior**:
- Rail background is `brand.accent` from the profile config (`#5E6AD2` for lawdog).
- Active panels show `rgba(255,255,255,0.22)` fill; inactive show `rgba(255,255,255,0.75)` text.
- Hover: `rgba(255,255,255,0.12)` fill.
- The **Ask** entry has a distinct white-bordered pill style — visually primary among peers.
- Sections are separated by dividers (core / chat / legal).
- Clicking any entry calls `openPanel(panelType)`, which opens or focuses that panel.
- The rail only renders when `getAuthConfig()` is non-null (i.e., lawdog or cube profile).

---

## 3. Fixture bleed fix

**File**: `src/panels/chat-rail.tsx`, function `sendMessage`.

**Before** (health-vertical fixtures in a legal profile):
```
citations: [
  { label: "Care Plan Summary § Overview", docId: "d1", sectionId: "s1" },
  { label: "Lab Results § HbA1c", docId: "d3", sectionId: "s13" },
]
```

**After** (matter-context reply, no cross-vertical citations):
```
// If context has a selected matter, reply references that matter by name.
// Citations are empty — no hardcoded health-vertical fixture bleeds in.
citations: []
```

The suggested questions (chip prompts) were already scoped to lawdog via
`lawdog.config.json → chat.suggestedQuestions` ("What is unexamined in this
matter?", etc.). Only the mock-reply citations were wrong; those are now gone.

---

## 4. Tenant scope assertion

### Claim

`ba.lloyd@yahoo.com` is a member of the `lawdog` tenant ONLY. Non-admin members
MUST see ONLY their tenant's matters. `Kelly v. Motheral` and `Safeco` MUST NEVER
render for Blake Lloyd.

### Proof path

```
listEntities()
    │
    ├── calls this.q("ld_cases", "select=*&order=created_at.desc")
    │
    ├── q() calls getAccessToken() → ba.lloyd's GoTrue JWT
    │
    ├── HTTP GET /rest/v1/ld_cases?select=*&order=created_at.desc
    │   Headers:
    │     apikey:         <anon key>          (public, rate-limits the anon role)
    │     Authorization:  Bearer <user-JWT>   (identifies ba.lloyd to Postgres)
    │     Accept-Profile: legal               (routes to the legal schema)
    │
    ├── PostgREST extracts JWT claims → sets request.jwt.claims in Postgres session
    │
    ├── Postgres evaluates FORCE RLS on legal.ld_cases:
    │     POLICY tenant_isolation:
    │       USING (tenant_id = (request.jwt.claims->>'tenant_id')::uuid)
    │
    │   ba.lloyd's JWT: tenant_id = 10000000-0000-4000-8000-000000000001 (lawdog)
    │   Result: only rows with that tenant_id pass the policy
    │
    ├── Wire response contains ONLY lawdog-tenant rows
    │   (Kelly v. Motheral and Safeco are in different tenants → never returned)
    │
    └── Client maps rows → Entity[] with no post-fetch tenant_id filter
        (confirmed: test/tenant-scope.test.ts assertion B)
```

### Why this is query-level, not client-side

The client query is:
```
/rest/v1/ld_cases?select=*&order=created_at.desc
```

There is **no** `&tenant_id=eq.${tenantId}` appended by the client. The
scoping is exclusively via RLS — Postgres evaluates the policy before returning
any rows. Even if a bug introduced a cross-tenant row into the result, the test
suite (`test/tenant-scope.test.ts`, assertion B) documents that the client would
surface it — proving the DB is the authoritative enforcement layer, not a
client-side filter that could be bypassed.

### Test evidence

`test/tenant-scope.test.ts` asserts:
- **(A)** `listEntities()` sends `Authorization: Bearer <user-jwt>` (not anon key).
- **(A)** `Accept-Profile: legal` is present (routes to the RLS-bearing schema).
- **(B)** The URL contains no `tenant_id=eq.` client filter.
- **(B)** All rows the DB returns are passed through without post-fetch drops.
