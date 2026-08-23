/**
 * Vercel function: /api/inbox  ->  the operator inbox board.
 *
 * A thin adapter and nothing else; the judgement lives in server/inbox/handler.ts,
 * which is framework-free so it can be tested without a running platform.
 *
 * It answers BOTH calling conventions, reusing the where-are-we adapter rather
 * than repeating it: the Node runtime hands these routes an IncomingMessage whose
 * `headers` is a plain object with no `.get`, and assuming a `Request` is a claim
 * about the platform that cost that route a 500 on its first real deployment.
 */

import { readInboxEnv, BrokerConfigError } from "../server/inbox/env.js";
import { handleInboxRequest } from "../server/inbox/handler.js";
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
    env = readInboxEnv(process.env);
  } catch (e) {
    // Message names a variable, never a value — see server/inbox/env.ts.
    console.error(
      e instanceof BrokerConfigError ? `inbox_misconfigured: ${e.message}` : "inbox_misconfigured",
    );
    return send(500, { error: "inbox_misconfigured" });
  }

  const result = await handleInboxRequest(
    {
      method: request?.method ?? "GET",
      url: absoluteUrl(request?.url, "/api/inbox"),
      headers: headerReader(request?.headers),
    },
    { env, fetch, log: (m) => console.error(`[inbox] ${m}`) },
  );

  return send(result.status, result.body, result.headers);
}
