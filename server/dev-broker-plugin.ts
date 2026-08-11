/**
 * `npm run dev` has no Vercel functions, so /api/cube/* would 404 locally and
 * the proof surface could only be exercised in production. This mounts the same
 * handler on the dev server — same code path, same refusals.
 *
 * Dev only (`apply: "serve"`). It is never part of a build, and it holds no
 * secret of its own: it reads the same server-side env the function reads, so
 * an unconfigured dev machine gets a clean 500 rather than a fake success.
 */

import type { Plugin } from "vite";
import { readBrokerEnv } from "./broker/env";
import { handleCubeRequest } from "./broker/handler";

export function devBrokerPlugin(): Plugin {
  return {
    name: "cube-broker-dev",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/api/cube", async (req, res, next) => {
        if (!req.url) return next();

        const send = (status: number, body: unknown) => {
          res.statusCode = status;
          res.setHeader("content-type", "application/json; charset=utf-8");
          res.setHeader("cache-control", "no-store");
          res.end(JSON.stringify(body));
        };

        let env;
        try {
          env = readBrokerEnv(process.env);
        } catch (e) {
          console.error(`[cube-broker] misconfigured: ${(e as Error).message}`);
          return send(500, { error: "broker_misconfigured" });
        }

        // Vite strips the mount prefix from req.url; put it back so the handler
        // parses the resource exactly as it does in production.
        const url = new URL(`/api/cube${req.url}`, "http://localhost");
        const headers = {
          get: (name: string) => {
            const v = req.headers[name.toLowerCase()];
            return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
          },
        };

        const result = await handleCubeRequest(
          { method: req.method ?? "GET", url: url.toString(), headers },
          { env, fetch, log: (m) => console.error(`[cube-broker] ${m}`) }
        );
        send(result.status, result.body);
      });
    },
  };
}
