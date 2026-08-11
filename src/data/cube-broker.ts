/**
 * Client half of the Cube broker.
 *
 * This file is the entire browser-side surface of the Cube, and it deliberately
 * knows almost nothing: no Cube hostname, no Cube key, no table names, no
 * tenant id. It sends the user's MASTER session to a same-origin path and gets
 * rows back. Everything that could be abused — which project, which table,
 * which tenant, which columns — is decided in server/broker/, where the
 * browser cannot reach it.
 *
 * If you ever find yourself wanting to add a Cube URL or key here, that is the
 * signal that the change belongs in server/broker/resources.ts instead.
 */

import { getAccessToken } from "./lawdog-auth";
import { mapRateRow, type LdRate } from "./lawdog-provider";
import { getConfig } from "@/config";

/** Codes only — the broker never returns detail, and neither does this. */
export class BrokerError extends Error {
  code: string;

  constructor(code: string) {
    super(code);
    this.name = "BrokerError";
    this.code = code;
  }
}

interface BrokerPayload<T> {
  resource: string;
  tenant: string;
  rows: T[];
}

export async function brokerGet<T>(
  resource: string,
  params?: Record<string, string>
): Promise<T[]> {
  // Signed out is refused here as well as at the broker. Not a substitute for
  // the server check — a courtesy, so a signed-out panel does not fire a request
  // that can only 401.
  const token = await getAccessToken();
  if (!token) throw new BrokerError("not_authenticated");

  const query = new URLSearchParams(params ?? {});
  const suffix = query.toString() ? `?${query.toString()}` : "";

  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  // Only meaningful for an operator who belongs to more than one tenant; the
  // broker rejects any value that is not one of the caller's own memberships.
  const pinned = getConfig().data.broker?.tenantId;
  if (pinned) headers["X-Tenant-Id"] = pinned;

  const res = await fetch(`/api/cube/${resource}${suffix}`, { headers });
  const json = (await res.json().catch(() => null)) as
    | BrokerPayload<T>
    | { error?: string }
    | null;

  if (!res.ok) {
    const code = json && "error" in json && json.error ? json.error : `http_${res.status}`;
    throw new BrokerError(String(code));
  }
  if (!json || !("rows" in json) || !Array.isArray(json.rows)) {
    throw new BrokerError("bad_payload");
  }
  return json.rows;
}

/**
 * Rate card over the broker — the same shape `LawDogProvider.listRateCard()`
 * returns, through the same row mapper, so the Rates panel renders identically
 * whichever door it came through.
 */
export async function listRateCardViaBroker(): Promise<LdRate[]> {
  const rows = await brokerGet<Record<string, unknown>>("rate_card");
  return rows.map(mapRateRow);
}

export function isBrokerMode(): boolean {
  return getConfig().data.mode === "cube-broker";
}
