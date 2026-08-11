/**
 * Broker environment — server-only, read once per invocation.
 *
 * NOTHING HERE MAY EVER CARRY A `VITE_` PREFIX. Vite inlines every `VITE_*`
 * variable into the client bundle at build time; a Cube credential named
 * `VITE_CUBE_BROKER_KEY` would ship to every browser that loads the shell.
 * `assertNotClientExposed` below turns that mistake into a boot failure rather
 * than a silent leak, and `test/bundle-secrets.test.ts` proves the built
 * bundle is clean.
 *
 * Values are set by hand in the Vercel project (law #4 — secrets are
 * Dave-hands-only; no key is ever written into this repo).
 */

export interface BrokerEnv {
  /** Master auth home — https://ulzyudbqkmjistymlqwg.supabase.co. Verifies sessions. */
  masterUrl: string;
  /** Master anon key. Public by design: it is the apikey that accompanies a user's own JWT. */
  masterAnonKey: string;
  /** Cube data plane — https://iofslupbvedjzmfmkdvx.supabase.co. Reached ONLY from here. */
  cubeUrl: string;
  /** Scoped Cube credential. Server-only. Never reaches a browser, never logged. */
  cubeKey: string;
  /** PostgREST schema profile for the Cube read, when it is not `public`. */
  cubeSchema: string | null;
  /** The shell's own tenancy table, on master. Read with the *user's* token, so RLS scopes it. */
  membershipTable: string;
}

export class BrokerConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BrokerConfigError";
  }
}

function required(source: Record<string, string | undefined>, name: string): string {
  const value = source[name];
  if (!value) {
    // Name only. Never interpolate a value into an error — errors surface in logs.
    throw new BrokerConfigError(`Missing required server env var ${name}`);
  }
  return value;
}

/**
 * Fail loudly if a server secret has also been published under a `VITE_` name.
 * Compares values, not names: the leak that matters is the same string being
 * reachable from a client-visible variable, whatever it is called there.
 */
export function assertNotClientExposed(
  source: Record<string, string | undefined>,
  secret: string
): void {
  for (const [name, value] of Object.entries(source)) {
    if (name.startsWith("VITE_") && value && value === secret) {
      throw new BrokerConfigError(
        `Server credential is also exposed as ${name}; VITE_* variables are inlined into the client bundle`
      );
    }
  }
}

export function readBrokerEnv(source: Record<string, string | undefined>): BrokerEnv {
  const cubeKey = required(source, "CUBE_BROKER_KEY");
  assertNotClientExposed(source, cubeKey);

  return {
    masterUrl: required(source, "MASTER_URL").replace(/\/+$/, ""),
    masterAnonKey: required(source, "MASTER_ANON_KEY"),
    cubeUrl: required(source, "CUBE_URL").replace(/\/+$/, ""),
    cubeKey,
    cubeSchema: source.CUBE_SCHEMA ?? "legal",
    membershipTable: source.SHELL_MEMBERSHIP_TABLE ?? "shell_tenant_members",
  };
}
