# universal-workspace-shell
Universal Workspace Shell — Centripetal standard operator chrome

The shell is also the login door: Cube-backed surfaces sign in through master
auth and read their data through a server-side broker, never a client-held key.
See [ARCHITECTURE.md](ARCHITECTURE.md).

```bash
npm ci
npm run dev        # VITE_PROFILE picks the profile — see .env.example
npm run typecheck
npm test
```

## Search-engine visibility (D-NOINDEX-1)

Every profile built from `index.html` (lawdog, cube, lending-app) is
`noindex` + `Disallow: /` by default at build time
(`build-plugins/public-surface-gate-plugin.ts`) — a real `dist/robots.txt`
the SPA rewrite in `vercel.json` cannot swallow, plus a `<meta
name="robots">` tag. **The default is safe**: an unset `VITE_PUBLIC_LAUNCH`
means unindexable. Set `VITE_PUBLIC_LAUNCH=true` in a hosting project's env
only once that specific surface is meant to be found — see `.env.example`.

This does not reach `sites/lending` (the public marketing site, its own
`vite.lending.config.ts` build and its own `public/robots.txt`) — that
surface is deliberately indexable by design and ships its own directives.
