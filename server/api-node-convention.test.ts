import { describe, expect, it } from "vitest";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * THE CLASS GUARD — every route in api/, not just the two we already burned on.
 *
 * TWO STRIKES, SAME SHAPE, TWENTY-FOUR HOURS APART:
 *   2026-08-23  /api/whereweare  500  "TypeError: headers.get is not a function"
 *   2026-08-24  /api/cube/*      no response at all for 300s (D-MSDOOR-2)
 *
 * Both because the route typed its argument as a Web `Request`. On the Vercel
 * Node runtime the argument is an IncomingMessage — `headers` is a plain object
 * with no `.get`, `url` is a bare path — and a returned `Response` is IGNORED,
 * which is why the second one hung instead of merely failing. Vercel's own log:
 *
 *   WARN: default export returned a `Response`.
 *   The default-export signature is `(req, res) => void` — returns are ignored.
 *
 * Fixing the two known routes leaves the THIRD one to be written next month by
 * someone who copies the wrong template. So this test walks api/ and holds every
 * entrypoint to the contract, discovering new files by itself. A route added
 * tomorrow is covered without anyone remembering to add it here.
 */

const API_DIR = join(import.meta.dirname, "..", "api");

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return routeFiles(full);
    return entry.endsWith(".ts") && !entry.endsWith(".test.ts") ? [full] : [];
  });
}

/** A Node ServerResponse double that records whether the route ended the request. */
function nodeResponse() {
  const sent: { status?: number; ended: boolean; body?: string } = { ended: false };
  return {
    sent,
    res: {
      set statusCode(v: number) {
        sent.status = v;
      },
      get statusCode() {
        return sent.status ?? 0;
      },
      setHeader: () => undefined,
      end: (body?: string) => {
        sent.ended = true;
        sent.body = body;
      },
    },
  };
}

const files = routeFiles(API_DIR);

describe("every api/ entrypoint answers under the Node calling convention", () => {
  it("finds the routes at all (a guard over an empty set guards nothing)", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    const name = file.slice(API_DIR.length + 1);

    it(`${name} ENDS the request rather than returning a Response`, async () => {
      // Deliberately no env: the misconfigured path must ALSO answer. That path
      // is exactly where D-MSDOOR-2 hung — it logged, returned a Response, and
      // the socket stayed open for the full 300s lambda timeout.
      const mod = await import(/* @vite-ignore */ file);
      const { res, sent } = nodeResponse();

      await mod.default(
        {
          method: "GET",
          url: "/api/probe", // a bare Node path, not an absolute URL
          headers: {}, // a plain object: NO .get
        },
        res,
      );

      expect(sent.ended, `${name} never called res.end() — the request would hang`).toBe(true);
      expect(typeof sent.status, `${name} set no status code`).toBe("number");
    });

    it(`${name} does not throw on a header bag without .get`, async () => {
      const mod = await import(/* @vite-ignore */ file);
      const { res } = nodeResponse();
      await expect(
        mod.default({ method: "GET", url: "/api/probe", headers: {} }, res),
      ).resolves.not.toThrow();
    });
  }
});
