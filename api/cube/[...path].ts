/**
 * Vercel function: /api/cube/*  →  the broker.
 *
 * A thin adapter and nothing else. All of the judgement lives in
 * server/broker/handler.ts, which is framework-free so it can be tested
 * without a running platform (server/broker/handler.test.ts).
 *
 * IT ANSWERS BOTH CALLING CONVENTIONS, and that is the whole point of this
 * file. This route previously typed its argument as a Web `Request` and handed
 * `request.headers` straight to the handler. On the Vercel Node runtime the
 * argument is an IncomingMessage: `headers` is a PLAIN OBJECT with no `.get`,
 * `url` is a bare path that `new URL()` cannot parse, and the reply must be
 * written to a response object rather than returned. So the route crashed
 * before it could refuse anyone — and where it did not crash it returned a
 * `Response` nobody was listening for, leaving the socket OPEN. That is what
 * D-MSDOOR-2 was: the Books pane spun forever because its fetch never settled,
 * on a route that answered nothing at all, signed in or not.
 *
 * /api/whereweare and /api/inbox both learned this first and already route
 * through server/whereweare/adapter.ts. This one now does too — same helpers,
 * no second copy of the lesson.
 */

import { readBrokerEnv, BrokerConfigError } from "../../server/broker/env.js";
import { handleCubeRequest } from "../../server/broker/handler.js";
import {
  absoluteUrl,
  headerReader,
  isNodeResponse,
  readJsonBody,
} from "../../server/whereweare/adapter.js";

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
    env = readBrokerEnv(process.env);
  } catch (e) {
    // Message names a variable, never a value — see server/broker/env.ts.
    console.error(
      e instanceof BrokerConfigError ? `broker_misconfigured: ${e.message}` : "broker_misconfigured"
    );
    return send(500, { error: "broker_misconfigured" });
  }

  try {
    const result = await handleCubeRequest(
      {
        method: request?.method ?? "GET",
        url: absoluteUrl(request?.url, "/api/cube/"),
        headers: headerReader(request?.headers),
        // Only read for the single POST the broker allows; harmless on a GET.
        json: () => readJsonBody(request),
      },
      { env, fetch, log: (m) => console.error(`[cube-broker] ${m}`) }
    );

    return send(result.status, result.body, result.headers);
  } catch (e) {
    // A route that throws here is a route that answers NOTHING, and an
    // unanswered request is the defect this file exists to end. Codes only —
    // the message can name upstream hosts and columns.
    console.error(`[cube-broker] unhandled: ${e instanceof Error ? e.message : "unknown"}`);
    return send(500, { error: "broker_failed" });
  }
}
