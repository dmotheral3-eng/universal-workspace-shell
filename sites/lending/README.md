# sites/lending — the public lending surface

`lending.centripetal-ai.com`. Registered in `project_routing` under slug
`lending-site` before anything was deployed.

## Why it lives in this repo

The hero renders the **real** operator component — `src/bw/scan-register.tsx` —
over fictional specimen rows, rather than a screenshot of it. A screenshot goes
stale the day the product moves; this one cannot, because it is the product. That
shared import is the whole reason a marketing page shares a repo with an app.

It is still a **separate build target and a separate Vercel project**, following
the `vite.proof.config.ts` precedent already here: its own root, its own outDir,
nothing crossing between the two bundles.

## Commands

```
npm run dev:lending      # vite dev server on :5312
npm run build:lending    # -> dist-lending/
```

`tsconfig.app.json` includes `sites`, so `npm run typecheck` and `npm run build`
both cover this directory. Without that it would compile only through Vite and
type errors here would be invisible — the same trap this estate has hit before.

## Vercel project settings

| | |
|---|---|
| Project | `centripetal-lending-site` (team `dmotheral3-engs-projects`) |
| Repository | `dmotheral3-eng/universal-workspace-shell`, branch `main` |
| Build command | `npm run build:lending` |
| Output directory | `dist-lending` |
| Install command | default |
| Domain | `lending.centripetal-ai.com` |

Root Directory stays at the repo root. Pointing it at `sites/lending` would
break the `@/bw/*` import that makes the hero real.

## Analytics

`VITE_POSTHOG_KEY` (and optionally `VITE_POSTHOG_HOST`) must be set in the
Vercel project's environment for the site to send anything. The code is
unconditional; the sending is not.

**Check the artifact, not the intention:** the page stamps
`data-analytics="sending"` or `data-analytics="no-key"` onto `<html>` at boot.
If that attribute says `no-key`, the deployed bundle was built without the key
and is reporting nothing, whatever the dashboard suggests.

## What may not appear on this surface

No client names. No third-party company names in any tier — the field is
described as systems of action, systems of decision and systems of record. No
tribal-lending references. No pricing figures; the commercial shape is described
in a sentence and the number is a conversation. Every product visual is a
fictional specimen and says so in its own frame.
