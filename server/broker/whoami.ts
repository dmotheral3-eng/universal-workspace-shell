/**
 * `GET /api/cube/whoami` — who the broker says you are (BOR-131).
 *
 * WHY THIS EXISTS. The session the browser holds proves one thing: master
 * issued it. It does not say which tenant the holder belongs to or what they
 * may do there — those live in the shell's membership table, and the broker is
 * already the only thing that reads it on every request. So "what are my
 * roles" has one honest answer on this surface, and it is the answer the
 * broker itself is about to act on. A list decoded from the token in the
 * browser would be a second opinion, and the two could disagree.
 *
 * WHAT IT RETURNS, AND WHY THAT IS NOT A LEAK. The caller's own user id and
 * email (they have both), their own tenant id and their own entitlement keys.
 * Every one of those is already readable by that user, with that same token,
 * straight from master — row security scopes the membership table to its
 * owner. This route adds no new sight; it only saves the browser from needing
 * master's table name.
 *
 * WHAT IT DOES NOT DO. It does not touch the Cube and it does not spend the
 * Cube credential. It is not metered: looking up your own name is not an
 * action a customer took.
 *
 * AN UNRESOLVED TENANT IS NOT A REFUSAL HERE. Someone signed in with no
 * membership is still someone — the answer is their identity with no tenant
 * and no entitlements, and `tenant_state` says which of the two reasons it
 * was. Only a missing or invalid session is refused.
 */

import { resolveTenant, verifyMasterSession } from "./identity.js";
import { bearerFrom, refuse, type BrokerDeps, type BrokerRequest, type BrokerResponse } from "./handler.js";

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  // Per-user. Must never sit in a shared cache.
  "cache-control": "no-store",
};

export async function handleWhoAmI(req: BrokerRequest, deps: BrokerDeps): Promise<BrokerResponse> {
  const token = bearerFrom(req.headers);
  if (!token) return refuse(401, "not_authenticated");

  const user = await verifyMasterSession(token, deps.env, deps.fetch);
  if (!user) return refuse(401, "not_authenticated");

  const requestedTenant = req.headers.get("x-tenant-id") ?? req.headers.get("X-Tenant-Id");
  const resolution = await resolveTenant(user, token, requestedTenant, deps.env, deps.fetch);

  return {
    status: 200,
    body: {
      user: { id: user.id, email: user.email },
      tenant: resolution.ok ? resolution.grant.tenantId : null,
      entitlements: resolution.ok ? resolution.grant.entitlements : [],
      tenant_state: resolution.ok ? "resolved" : resolution.reason,
    },
    headers: JSON_HEADERS,
  };
}
