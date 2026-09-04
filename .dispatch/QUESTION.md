# D-LDDEPLOY-1 — Investigation Complete (Human Review Needed for Root Cause)

**Status**: Investigation complete via GitHub API. Gap has self-healed. Vercel-side audit blocked (no token).  
**Immediate action needed**: None — integration is working, D-NOINDEX-1 fix is live.  
**Human action needed**: Confirm what reconnected the Vercel integration and whether a safeguard is warranted.

---

## What Was Found (GitHub API evidence, no Vercel token available)

### The deployment gap — confirmed and characterized

sha `840860bc` (D-NOINDEX-1, merged 2026-08-25T05:12:21Z) was the first commit in the gap.
Every commit from `840860bc` through PR #34 (`43985e0`, 2026-08-31) shows this pattern:

- **Only one Vercel commit status context**: `"Vercel"` → target URL points at `lending-app` only.
- **Zero commit statuses for universal-workspace-shell**.
- GitHub deployment records for these SHAs: environment label is generic `"Production"` (not `"Production – universal-workspace-shell"`), and the deployment URL traces to lending-app.

The gap ran approximately **8 days**: 2026-08-25T05:12Z → 2026-09-02T03:15Z.

### The self-healing — confirmed

sha `ace0b641` (PR #35, 2026-09-02T03:15Z) produced **two distinct commit status contexts for the first time**:

```
context: "Vercel – lending-app"     → vercel.com/.../lending-app/Evjw5cYnW2ozaTgVuY638WJohcCd
context: "Vercel – universal-workspace-shell" → vercel.com/.../universal-workspace-shell/GwYFmYpLMDkJKN6S3RM6FpCqGPsx
```

This is a qualitative change — the Vercel GitHub App integration was **reconfigured** between 2026-08-31 and 2026-09-02, not just "resumed". The old integration posted a single `"Vercel"` context; the new one posts per-project contexts. This is consistent with someone reconnecting the integration (which re-creates the webhook) during that window.

GitHub deployment record for that SHA: `"Production – universal-workspace-shell"` (project-labeled), confirming prj_b3cwBdzvV8E4cCtxCNcCj7EBbfPb is now active.

### D-NOINDEX-1 fix — confirmed live on lawdog-app

```
curl -sD- https://lawdog-app.centripetal-ai.com/robots.txt
→ HTTP/2 200
→ content-type: text/plain; charset=utf-8
→ server: Vercel
→ User-agent: *
→ Disallow: /
```

The fix introduced in sha `840860bc` is live (it reached production via the post-gap deployment of `ace0b641`). The URL is not returning HTML.

---

## What I Could Not Determine (Vercel token required)

Steps 1 and 2 from the task spec require Vercel API access:

1. **Vercel project git integration settings** — cannot read `get_project` or `list_teams` to confirm the production branch, repo linkage, or webhook registration status.
2. **Vercel webhook delivery history for sha `840860bc`** — cannot query the Vercel webhook log to confirm whether the push event was received and rejected, or never received at all.

Without this, the exact trigger for the 8-day disconnection is unknown.

---

## Likely Root Cause (hypothesis, needs Vercel-side confirmation)

The prior art (artifact `chrome-vercel-connector-scope-20260814`) describes a 2026-08-14 incident where `team dmotheral3-engs-projects` saw 0 projects in the Vercel GitHub integration. That incident predates the gap by ~11 days. If the fix at the time only restored **project visibility** without fully restoring the **per-project GitHub App scope**, the universal-workspace-shell project might have been silently excluded from webhook delivery while lending-app continued working — consistent with what the commit status evidence shows.

The qualitative change in commit status context names at `ace0b641` (`"Vercel"` → `"Vercel – lending-app"` + `"Vercel – universal-workspace-shell"`) strongly suggests the integration was **fully reconnected** (not just resumed) between 2026-08-31 and 2026-09-02 — likely by someone manually reconnecting the project in the Vercel dashboard.

---

## Questions for Human with Vercel Access

1. Who reconnected the universal-workspace-shell integration between 2026-08-31 and 2026-09-02, and what was the root cause of the gap?
2. Is the Vercel GitHub App now scoped to BOTH `lending-app` and `universal-workspace-shell` at the installation level, or does one depend on the other?
3. Is there a Vercel project for `lending-site` (the third project in `project_routing`)? Its commits show no Vercel status either — is it intentionally not auto-deploying?
4. Should the prior art incident (2026-08-14) be treated as a recurring risk? If so, a periodic smoke-test (e.g., checking that both Vercel status contexts appear on each main push) would detect a silent regression before the next 8-day gap.

---

## Current State (as of 2026-09-04)

| Item | Status |
|------|--------|
| Integration working | ✓ Active since 2026-09-02 |
| D-NOINDEX-1 live on lawdog-app | ✓ Confirmed via curl |
| robots.txt content | `Disallow: /` (correct) |
| Last production deploy (UWS) | `ace0b641` 2026-09-02T03:15Z |
| Vercel commit-status context | `"Vercel – universal-workspace-shell"` (project-labeled) |

No code change is needed. No deployment action is needed. The gap is closed.
