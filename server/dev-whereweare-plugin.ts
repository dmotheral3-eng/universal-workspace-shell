/**
 * `npm run dev` has no Vercel functions, so /api/whereweare would 404 locally.
 * This mounts the same handler on the dev server — same code path, same refusals.
 *
 * Dev only (`apply: "serve"`). Never part of a build, and holds no secret of its
 * own: it reads the same server-side env the function reads, so an unconfigured
 * dev machine gets a clean 500 rather than a fake success.
 */

import type { Plugin } from "vite";
import { readWhereWeAreEnv } from "./whereweare/env.js";
import { handleWhereWeAreRequest } from "./whereweare/handler.js";

export function devWhereWeArePlugin(): Plugin {
  return {
    name: "whereweare-dev",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/api/whereweare", async (req, res) => {
        const send = (status: number, body: unknown) => {
          res.statusCode = status;
          res.setHeader("content-type", "application/json; charset=utf-8");
          res.setHeader("cache-control", "no-store");
          res.end(JSON.stringify(body));
        };

        let env;
        try {
          env = readWhereWeAreEnv(process.env);
        } catch (e) {
          console.error(`[whereweare] misconfigured: ${(e as Error).message}`);
          return send(500, { error: "whereweare_misconfigured" });
        }

        const headers = {
          get: (name: string) => {
            const v = req.headers[name.toLowerCase()];
            return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
          },
        };

        const result = await handleWhereWeAreRequest(
          {
            method: req.method ?? "GET",
            url: new URL(`/api/whereweare${req.url ?? ""}`, "http://localhost").toString(),
            headers,
          },
          { env, fetch, log: (m) => console.error(`[whereweare] ${m}`) }
        );
        send(result.status, result.body);
      });
    },
  };
}
