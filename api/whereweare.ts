/**
 * Vercel function: /api/whereweare  ->  the where-are-we ladder.
 *
 * A thin adapter and nothing else, exactly like api/cube/[...path].ts. All of the
 * judgement lives in server/whereweare/handler.ts, which is framework-free so it
 * can be tested without a running platform.
 */

import { readWhereWeAreEnv, BrokerConfigError } from "../server/whereweare/env.js";
import { handleWhereWeAreRequest } from "../server/whereweare/handler.js";

export const config = { runtime: "nodejs" };

export default async function handler(request: Request): Promise<Response> {
  let env;
  try {
    env = readWhereWeAreEnv(process.env);
  } catch (e) {
    // Message names a variable, never a value — see server/whereweare/env.ts.
    console.error(
      e instanceof BrokerConfigError
        ? `whereweare_misconfigured: ${e.message}`
        : "whereweare_misconfigured"
    );
    return json(500, { error: "whereweare_misconfigured" });
  }

  const result = await handleWhereWeAreRequest(
    { method: request.method, url: request.url, headers: request.headers },
    { env, fetch, log: (m) => console.error(`[whereweare] ${m}`) }
  );

  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: result.headers,
  });
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
