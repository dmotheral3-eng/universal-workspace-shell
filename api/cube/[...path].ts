/**
 * Vercel function: /api/cube/*  →  the broker.
 *
 * A thin adapter and nothing else. All of the judgement lives in
 * server/broker/handler.ts, which is framework-free so it can be tested
 * without a running platform (server/broker/handler.test.ts).
 */

import { readBrokerEnv, BrokerConfigError } from "../../server/broker/env";
import { handleCubeRequest } from "../../server/broker/handler";

export const config = { runtime: "nodejs" };

export default async function handler(request: Request): Promise<Response> {
  let env;
  try {
    env = readBrokerEnv(process.env);
  } catch (e) {
    // Message names a variable, never a value — see server/broker/env.ts.
    console.error(
      e instanceof BrokerConfigError ? `broker_misconfigured: ${e.message}` : "broker_misconfigured"
    );
    return json(500, { error: "broker_misconfigured" });
  }

  const result = await handleCubeRequest(
    { method: request.method, url: request.url, headers: request.headers },
    { env, fetch, log: (m) => console.error(`[cube-broker] ${m}`) }
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
