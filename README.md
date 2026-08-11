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
