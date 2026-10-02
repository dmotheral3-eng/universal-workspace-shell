/**
 * Refine's data provider, over the broker (BOR-130).
 *
 * THIS FILE ADDS NO DOOR. Every read goes through `brokerGet` and every write
 * through `brokerPost` — the same two functions, the same same-origin path, the
 * same posture: no Cube host, no key, no table, no tenant in the browser. What
 * this adds is only the shape Refine's hooks expect on top of them, so
 * `useTable` / `useShow` / `useMany` / `useForm` have something to call.
 *
 * WHAT `meta` CARRIES, because Refine's own vocabulary and the broker's are not
 * the same and pretending otherwise is how a filter gets silently ignored:
 *
 *   meta.resource       the BROKER resource to knock on, when it differs from
 *                       the Refine resource name (the registry's `resource`
 *                       column — see refine-resources.ts)
 *   meta.book_id        the selected book; sent as the broker's `book` narrowing
 *   meta.params         further narrowings the broker's allowlist names, verbatim
 *   meta.brokerFilters  { field → broker param }: which Refine `eq` filters the
 *                       broker honours server-side. Anything not named here is
 *                       NOT sent — see below
 *   meta.idColumn       the column a row's `id` is taken from, for views that
 *                       carry no `id` of their own
 *   meta.key            a write's row address, by the server allowlist's key names
 *
 * FILTERS AND SORTERS THE BROKER DOES NOT TAKE. The broker accepts a short,
 * named list of narrowings and fixes the order server-side. A Refine filter or
 * sorter outside that list is applied HERE, to the rows that came back — which
 * is at most the resource's row ceiling, not the whole table — and it is logged
 * as `unsupported_filter` / `unsupported_sorter`. It is never dropped quietly:
 * a table that looks filtered and is not is worse than one that says it cannot.
 *
 * A REFUSAL IS AN ANSWER. A list the caller is not entitled to comes back as
 * `{data: [], total: 0, meta: {refused: code}}`, not as a thrown error — the
 * same ruling `use-lending-data.ts` already makes, so a panel can say "you have
 * no access to this book" instead of "something went wrong". Every other
 * failure still throws its `BrokerError`, codes only.
 *
 * WRITES ARE PESSIMISTIC BY CONSTRUCTION. `update` resolves with the row the
 * server returned after the wall said yes. On a refusal it rejects with the
 * wall's code and returns nothing to paint.
 */

import type {
  BaseKey,
  BaseRecord,
  CrudFilter,
  CrudSort,
  DataProvider,
  LogicalFilter,
  MetaQuery,
} from "@refinedev/core";
import { BrokerError, brokerGet, brokerPost, type BrokerWriteBody } from "./cube-broker";
import { isRefusalCode } from "@/shell/door-email-claim";

type Row = Record<string, unknown>;

interface BrokerMeta {
  resource?: string;
  book_id?: string;
  params?: Record<string, string>;
  brokerFilters?: Record<string, string>;
  idColumn?: string;
  key?: Record<string, string>;
}

const metaOf = (meta: MetaQuery | undefined): BrokerMeta => (meta ?? {}) as BrokerMeta;

/** Each unsupported filter/sorter is reported once per page load, not once per render. */
const reported = new Set<string>();
function report(kind: "unsupported_filter" | "unsupported_sorter" | "unsupported_operator", resource: string, detail: string) {
  const key = `${kind}:${resource}:${detail}`;
  if (reported.has(key)) return;
  reported.add(key);
  // Names only — a filter VALUE can be a person's name or an account ref.
  console.warn(`[data] ${kind}`, { resource, detail });
}

/** Test seam: the once-only memory is module state. */
export function resetUnsupportedReports(): void {
  reported.clear();
}

function isLogical(filter: CrudFilter): filter is LogicalFilter {
  return "field" in filter;
}

const text = (v: unknown): string => (v === null || v === undefined ? "" : String(v));

/** One client-side comparison. Returns null for an operator this file does not implement. */
function matches(row: Row, filter: LogicalFilter): boolean | null {
  const actual = row[filter.field];
  const want = filter.value;
  switch (filter.operator) {
    case "eq":
      return text(actual) === text(want);
    case "ne":
      return text(actual) !== text(want);
    case "in":
      return Array.isArray(want) && want.map(text).includes(text(actual));
    case "nin":
      return Array.isArray(want) && !want.map(text).includes(text(actual));
    case "contains":
      return text(actual).toLowerCase().includes(text(want).toLowerCase());
    case "null":
      return actual === null || actual === undefined;
    case "nnull":
      return actual !== null && actual !== undefined;
    case "gt":
      return Number(actual) > Number(want);
    case "gte":
      return Number(actual) >= Number(want);
    case "lt":
      return Number(actual) < Number(want);
    case "lte":
      return Number(actual) <= Number(want);
    default:
      return null;
  }
}

function compare(a: unknown, b: unknown): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return text(a).localeCompare(text(b), undefined, { numeric: true });
}

/** A value becomes the broker's `id` param only if it is plainly an id. */
function withId<T extends Row>(row: T, idColumn: string | undefined): T & BaseRecord {
  if (row.id !== undefined && row.id !== null) return row as T & BaseRecord;
  if (idColumn && row[idColumn] !== undefined && row[idColumn] !== null) {
    return { ...row, id: row[idColumn] as BaseKey };
  }
  return row as T & BaseRecord;
}

function baseParams(meta: BrokerMeta): Record<string, string> {
  const params: Record<string, string> = { ...(meta.params ?? {}) };
  if (meta.book_id) params.book = meta.book_id;
  return params;
}

function writeBody(
  action: BrokerWriteBody["action"],
  id: BaseKey | undefined,
  variables: unknown,
  meta: BrokerMeta
): BrokerWriteBody {
  const key = meta.key ?? (id !== undefined ? { id: String(id) } : {});
  const body: BrokerWriteBody = { action, id: key };
  if (action !== "delete") {
    const values: Record<string, string> = {};
    for (const [name, value] of Object.entries((variables ?? {}) as Row)) {
      // The server accepts strings only and refuses anything else by name; an
      // undefined field is one the form never touched, so it is not sent.
      if (value === undefined) continue;
      values[name] = typeof value === "string" ? value : String(value);
    }
    body.values = values;
  }
  return body;
}

export const brokerDataProvider: DataProvider = {
  getApiUrl: () => "/api/cube",

  getList: async ({ resource, filters, sorters, pagination, meta }) => {
    const m = metaOf(meta);
    const target = m.resource ?? resource;
    const params = baseParams(m);

    // Split the filters: the ones the broker is declared to honour go up; the
    // rest are applied below and said out loud.
    const local: LogicalFilter[] = [];
    for (const filter of filters ?? []) {
      if (!isLogical(filter)) {
        report("unsupported_filter", target, `${filter.operator}(…)`);
        continue;
      }
      const param = m.brokerFilters?.[filter.field];
      if (param && filter.operator === "eq" && filter.value !== undefined && filter.value !== null && filter.value !== "") {
        params[param] = String(filter.value);
        continue;
      }
      // An empty filter value is "no filter", the way every table input means it.
      if (filter.value === undefined || filter.value === null || filter.value === "") continue;
      report("unsupported_filter", target, filter.field);
      local.push(filter);
    }

    let rows: Row[];
    try {
      rows = await brokerGet<Row>(target, params);
    } catch (e) {
      const code = (e as { code?: unknown } | null)?.code;
      if (isRefusalCode(code)) {
        return { data: [], total: 0, meta: { refused: code as string } };
      }
      throw e;
    }

    for (const filter of local) {
      rows = rows.filter((row) => {
        const verdict = matches(row, filter);
        if (verdict === null) {
          report("unsupported_operator", target, `${filter.field}:${filter.operator}`);
          return true;
        }
        return verdict;
      });
    }

    const sorting: CrudSort[] = sorters ?? [];
    if (sorting.length > 0) {
      for (const s of sorting) report("unsupported_sorter", target, s.field);
      rows = [...rows].sort((a, b) => {
        for (const s of sorting) {
          const d = compare(a[s.field], b[s.field]);
          if (d !== 0) return s.order === "desc" ? -d : d;
        }
        return 0;
      });
    }

    const total = rows.length;

    // The broker returns the whole (ceiling-bounded) set, so a page is a slice
    // of it. `off` and `client` both mean "hand everything over".
    const mode = pagination?.mode ?? "server";
    if (mode === "server") {
      const size = pagination?.pageSize ?? 10;
      const page = pagination?.currentPage ?? 1;
      rows = rows.slice((page - 1) * size, page * size);
    }

    return { data: rows.map((r) => withId(r, m.idColumn)) as never[], total };
  },

  getOne: async ({ resource, id, meta }) => {
    const m = metaOf(meta);
    const target = m.resource ?? resource;
    const rows = await brokerGet<Row>(target, { ...baseParams(m), id: String(id) });
    if (rows.length === 0) throw new BrokerError("not_found");
    return { data: withId(rows[0], m.idColumn) as never };
  },

  getMany: async ({ resource, ids, meta }) => {
    const m = metaOf(meta);
    const target = m.resource ?? resource;
    // No ids is no question: asking the broker would return the whole resource.
    if (ids.length === 0) return { data: [] };
    const rows = await brokerGet<Row>(target, { ...baseParams(m), ids: ids.map(String).join(",") });
    return { data: rows.map((r) => withId(r, m.idColumn)) as never[] };
  },

  create: async ({ resource, variables, meta }) => {
    const m = metaOf(meta);
    const { row } = await brokerPost<Row>(m.resource ?? resource, writeBody("create", undefined, variables, m));
    return { data: withId(row, m.idColumn) as never };
  },

  update: async ({ resource, id, variables, meta }) => {
    const m = metaOf(meta);
    const { row } = await brokerPost<Row>(m.resource ?? resource, writeBody("update", id, variables, m));
    // `id` is put back as the caller named it: the checklist view has no id of
    // its own, and Refine keys its cache on the one the form was opened with.
    return { data: { ...withId(row, m.idColumn), id: (row.id as BaseKey | undefined) ?? id } as never };
  },

  deleteOne: async ({ resource, id, meta }) => {
    const m = metaOf(meta);
    const { row } = await brokerPost<Row>(m.resource ?? resource, writeBody("delete", id, undefined, m));
    return { data: { ...withId(row, m.idColumn), id: (row.id as BaseKey | undefined) ?? id } as never };
  },

  // No free-form door. `custom` is how a data provider grows a tunnel past its
  // own allowlist; if a surface needs a new read or write, it is a new row in
  // server/broker/resources.ts.
  custom: async () => {
    throw new BrokerError("unsupported");
  },
};
