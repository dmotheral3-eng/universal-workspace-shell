/**
 * Calling-convention normalisation for the api/ functions.
 *
 * Named for /api/whereweare because that is the route that first paid for it.
 * It is now shared by every entrypoint in api/ — whereweare, inbox and cube —
 * because they all face the same platform and there is no second copy of this
 * logic worth maintaining. D-MSDOOR-2 is what it cost to have a route that did
 * NOT use it: api/cube/[...path].ts assumed a Web `Request`, and on the Node
 * runtime it hung the socket instead of answering.
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

/**
 * The JSON body, under either convention.
 *
 * Web gives a `Request` with `.json()`. Node gives an IncomingMessage: some
 * platform versions pre-parse it onto `.body`, others leave it as an unread
 * stream. All three are handled here rather than in a route, because a route
 * that guesses which one it got is the D-MSDOOR-2 defect in a second costume.
 *
 * Throws on unparseable input, exactly as `Request.json()` does, so callers
 * keep their existing `try`/`catch` and their existing `bad_body` refusal.
 */
export async function readJsonBody(request: unknown): Promise<unknown> {
  const req = (request ?? {}) as {
    json?: () => Promise<unknown>;
    body?: unknown;
    on?: (event: string, cb: (chunk?: unknown) => void) => void;
  };

  if (typeof req.json === "function") return req.json();

  // Pre-parsed by the platform. A string still needs parsing; an object does not.
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === "string") return JSON.parse(req.body);
    if (typeof req.body !== "object") throw new SyntaxError("Unparseable body");
    return req.body;
  }

  if (typeof req.on !== "function") throw new SyntaxError("No readable body");

  const raw = await new Promise<string>((resolve, reject) => {
    let acc = "";
    req.on!("data", (chunk) => {
      acc += String(chunk);
    });
    req.on!("end", () => resolve(acc));
    req.on!("error", () => reject(new SyntaxError("Body read failed")));
  });

  if (raw === "") throw new SyntaxError("Empty body");
  return JSON.parse(raw);
}
