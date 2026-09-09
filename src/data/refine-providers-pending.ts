/**
 * The four providers, NOT YET BUILT — and saying so out loud.
 *
 * H1 (BOR-129) installs Refine and mounts it. The providers themselves are
 * BOR-130 (data), BOR-131 (auth), BOR-132 (access control) and BOR-133 (audit
 * log), one ticket each, because each has a real contract to meet against the
 * broker and the Cube.
 *
 * `<Refine>` requires `dataProvider`, so something has to occupy it for one
 * commit. Only that one: the providers Refine drives ITSELF on mount
 * (authProvider.check) cannot be stubbed at all, and land with their tickets. THE SHAPE OF THAT SOMETHING IS THE WHOLE POINT. A stub that returns
 * `{data: [], total: 0}` would be a working-looking provider that quietly
 * reports "no rows" for every resource on the surface — indistinguishable from
 * an empty tenant, and exactly the class canon calls a default that is
 * invisible on success. So every method here THROWS, named, with the ticket
 * that fills it. Nothing calls these yet; if anything ever does before its
 * ticket lands, it fails loudly at the call site instead of rendering a
 * plausible emptiness (law no-hardcoding, obligation 2 — fail loud on the
 * unknown).
 *
 * Delete this file in BOR-130. If it outlives that ticket, that is the defect.
 */

import type { DataProvider } from "@refinedev/core";

class ProviderNotInstalled extends Error {
  code = "provider_not_installed";
  constructor(method: string, ticket: string) {
    super(`${method} is not installed yet — ${ticket}`);
    this.name = "ProviderNotInstalled";
  }
}

const pending = (method: string, ticket: string) => (): never => {
  throw new ProviderNotInstalled(method, ticket);
};

/** BOR-130 — getList/getOne/getMany over brokerGet; writes via a new brokerPost. */
export const pendingDataProvider: DataProvider = {
  getList: pending("dataProvider.getList", "BOR-130"),
  getOne: pending("dataProvider.getOne", "BOR-130"),
  getMany: pending("dataProvider.getMany", "BOR-130"),
  create: pending("dataProvider.create", "BOR-130"),
  update: pending("dataProvider.update", "BOR-130"),
  deleteOne: pending("dataProvider.deleteOne", "BOR-130"),
  getApiUrl: () => "/api/cube",
  custom: pending("dataProvider.custom", "BOR-130"),
};
