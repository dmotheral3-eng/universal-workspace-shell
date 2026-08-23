/**
 * Where-are-we environment — server-only, read once per invocation.
 *
 * Same law as the Cube broker (server/broker/env.ts): NOTHING HERE MAY EVER CARRY
 * A `VITE_` PREFIX. Vite inlines every `VITE_*` variable into the client bundle at
 * build time, so a source credential published under a VITE_ name would ship to
 * every browser that loads the shell. `assertNotClientExposed` turns that mistake
 * into a boot failure, and test/bundle-secrets.test.ts proves the built bundle is
 * clean.
 *
 * MASTER_URL / MASTER_ANON_KEY are the SAME two variables the Cube broker already
 * requires, deliberately reused rather than duplicated under new names. The registry
 * on master is read with the CALLER's own token, so master's row security does the
 * scoping and this route needs no master secret of its own — the same choice
 * ARCHITECTURE.md makes for the broker's tenancy read.
 */

import { BrokerConfigError, assertNotClientExposed } from "../broker/env.js";

export interface WhereWeAreEnv {
  /** Master auth home. Verifies the caller's session and holds the ladder registry. */
  masterUrl: string;
  /** Master anon key. Public by design: the apikey that accompanies a user's own JWT. */
  masterAnonKey: string;
  /**
   * Per-source-project read credentials, `{ "<project_ref>": "<key>" }`.
   *
   * A ladder row names its own `source_ref`; the key for that ref is looked up here.
   * A ref with no entry is NOT an error and never fabricates a number — the ladder
   * comes back with `note: "no_source_credential"` and null counts, which the board
   * renders RED. Missing capability is visible, never silently absent.
   */
  sourceKeys: Record<string, string>;
}

/** Rows pulled from one source view in a single read. Beyond this the count is truncated and says so. */
export const SOURCE_ROW_CEILING = 5000;

/** How many pulse samples to walk back looking for the last substantive change. */
export const PULSE_WINDOW = 200;

export function readWhereWeAreEnv(source: Record<string, string | undefined>): WhereWeAreEnv {
  const masterUrl = source.MASTER_URL;
  if (!masterUrl) throw new BrokerConfigError("Missing required server env var MASTER_URL");
  const masterAnonKey = source.MASTER_ANON_KEY;
  if (!masterAnonKey) throw new BrokerConfigError("Missing required server env var MASTER_ANON_KEY");

  const sourceKeys = parseSourceKeys(source.WHEREWEARE_SOURCE_KEYS);
  for (const key of Object.values(sourceKeys)) assertNotClientExposed(source, key);

  return {
    masterUrl: masterUrl.replace(/\/+$/, ""),
    masterAnonKey,
    sourceKeys,
  };
}

/**
 * Absent is legal and means "no source is credentialled yet" — the board then shows
 * every ladder RED with a named reason, which is a truthful board. Malformed is NOT
 * legal: a typo that silently parsed to `{}` would look identical to "not set yet",
 * and the whole point of this surface is that a blank never passes for a fact.
 */
export function parseSourceKeys(raw: string | undefined): Record<string, string> {
  if (!raw || raw.trim() === "") return {};

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Name the variable, never echo the value — errors surface in logs.
    throw new BrokerConfigError("WHEREWEARE_SOURCE_KEYS is not valid JSON");
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new BrokerConfigError('WHEREWEARE_SOURCE_KEYS must be a JSON object of {"<project_ref>":"<key>"}');
  }

  const out: Record<string, string> = {};
  for (const [ref, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof value !== "string" || value === "") {
      throw new BrokerConfigError(`WHEREWEARE_SOURCE_KEYS entry ${ref} is not a non-empty string`);
    }
    out[ref] = value;
  }
  return out;
}

export { BrokerConfigError };
