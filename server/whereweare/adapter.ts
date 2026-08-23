/**
 * Calling-convention normalisation for the /api/whereweare function.
 *
 * WHY THIS FILE EXISTS, because it looks like ceremony and is not. The Vercel
 * Node runtime does not always hand a function a Web-standard `Request`. On the
 * deployment that first ran this route it handed a Node `IncomingMessage`, whose
 * `headers` is a PLAIN OBJECT with no `.get`, and the route died with
 * `TypeError: headers.get is not a function` before it could refuse anything.
 * A signature typed as `Request` is a claim about the platform, and that claim
 * was wrong (P#148 — verify the live surface, do not infer it).
 *
 * So the handler keeps its own small, explicit contract and the adapter meets the
 * platform where it actually is, in both directions, with tests that pin both.
 */

/** The only thing the handler wants from headers. */
export interface HeaderReader {
  get(name: string): string | null;
}

/**
 * Works for a Web `Headers`, a Node plain-object header bag (values may be
 * string arrays), and a missing bag. Lookup is case-insensitive either way,
 * because Node lowercases incoming header names and Web `Headers` does its own.
 */
export function headerReader(headers: unknown): HeaderReader {
  if (headers && typeof (headers as HeaderReader).get === "function") {
    return { get: (name) => (headers as HeaderReader).get(name) };
  }
  const bag = (headers ?? {}) as Record<string, string | string[] | undefined>;
  return {
    get: (name) => {
      const value = bag[name.toLowerCase()] ?? bag[name];
      if (Array.isArray(value)) return value[0] ?? null;
      return value ?? null;
    },
  };
}

/**
 * Node gives a path (`/api/whereweare?x=1`); Web gives an absolute URL. The
 * handler only ever needs a parseable URL, so a synthetic origin is correct and
 * is never used to address anything.
 */
export function absoluteUrl(url: string | undefined, fallbackPath: string): string {
  const raw = url && url !== "" ? url : fallbackPath;
  if (/^https?:\/\//i.test(raw)) return raw;
  return new URL(raw, "http://localhost").toString();
}

/** True when the platform handed us a Node response object rather than expecting a `Response`. */
export function isNodeResponse(value: unknown): boolean {
  return !!value && typeof (value as { setHeader?: unknown }).setHeader === "function";
}
