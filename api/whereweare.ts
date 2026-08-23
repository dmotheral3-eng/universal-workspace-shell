/**
 * Vercel function: /api/whereweare  ->  the where-are-we ladder.
 *
 * A thin adapter and nothing else. All of the judgement lives in
 * server/whereweare/handler.ts, which is framework-free so it can be tested
 * without a running platform.
 *
 * It answers BOTH calling conventions on purpose. The Node runtime handed this
 * route an IncomingMessage on its first real deployment -- `headers` a plain
 * object with no `.get` -- and the function crashed with a 500 before it could
 * refuse an anonymous caller. Assuming a `Request` is a claim about the platform;
 * see server/whereweare/adapter.ts.
 */

import { readWhereWeAreEnv, BrokerConfigError } from "../server/whereweare/env.js";
import { handleWhereWeAreRequest } from "../server/whereweare/handler.js";
import { absoluteUrl, headerReader, isNodeResponse } from "../server/whereweare/adapter.js";

export const config = { runtime: "nodejs" };

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

export default async function handler(request: any, response?: any): Promise<Response | void> {
  const nodeStyle = isNodeResponse(response);

  const send = (status: number, body: unknown, headers: Record<string, string> = JSON_HEADERS) => {
    if (nodeStyle) {
      response.statusCode = status;
      for (const [k, v] of Object.entries(headers)) response.setHeader(k, v);
      response.end(JSON.stringify(body));
      return;
    }
    return new Response(JSON.stringify(body), { status, headers });
  };

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
    return send(500, { error: "whereweare_misconfigured" });
  }

  const result = await handleWhereWeAreRequest(
    {
      method: request?.method ?? "GET",
      url: absoluteUrl(request?.url, "/api/whereweare"),
      headers: headerReader(request?.headers),
    },
    { env, fetch, log: (m) => console.error(`[whereweare] ${m}`) }
  );

  return send(result.status, result.body, result.headers);
}
