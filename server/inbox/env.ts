/**
 * Operator inbox environment — server-only, read once per invocation.
 *
 * NO NEW CREDENTIAL, AND THAT IS A DESIGN DECISION RATHER THAN AN OMISSION.
 * This route reuses MASTER_URL / MASTER_ANON_KEY — the same two variables the
 * Cube broker and the where-are-we ladder already require — and reads master
 * with the CALLER'S OWN TOKEN, so master's row security does the scoping.
 *
 * The alternative was a master service key in the shell's server env, which
 * would have made this route able to read every row on master for anybody who
 * could reach it. Every source below is reachable without one; where a source is
 * NOT reachable (see handler.ts on code_dispatch_queue) the honest answer is to
 * say so on the panel, not to arm the route with a key that outranks the person
 * holding it.
 *
 * Same law as its siblings: nothing here may ever carry a `VITE_` prefix, because
 * Vite inlines those into the client bundle. test/bundle-secrets.test.ts proves
 * the built bundle is clean.
 */

import { BrokerConfigError } from "../broker/env.js";

export interface InboxEnv {
  /** Master auth home. Verifies the caller's session and holds every source below. */
  masterUrl: string;
  /** Master anon key. Public by design: the apikey that accompanies a user's own JWT. */
  masterAnonKey: string;
}

/** Per-source row ceiling. Beyond this a panel says it is truncated rather than lying by omission. */
export const ROW_CEILING = 500;

export function readInboxEnv(source: Record<string, string | undefined>): InboxEnv {
  const masterUrl = source.MASTER_URL;
  if (!masterUrl) throw new BrokerConfigError("Missing required server env var MASTER_URL");
  const masterAnonKey = source.MASTER_ANON_KEY;
  if (!masterAnonKey) throw new BrokerConfigError("Missing required server env var MASTER_ANON_KEY");

  return { masterUrl: masterUrl.replace(/\/+$/, ""), masterAnonKey };
}

export { BrokerConfigError };
