import { useCallback, useEffect, useState } from "react";
import {
  listVendorChecklist,
  listVendors,
  type LendingVendor,
  type LendingVendorChecklistItem,
} from "@/data/lending-broker";
import { LD, LdEmpty, LdNote, dateOnly } from "@/panels/legal/ld-kit";
import { LdPanelFrame, type LdExplainCopy } from "@/panels/legal/ld-panel-frame";
import { EvidenceTable } from "./evidence-table";
import { useLendingData } from "./use-lending-data";

/* ── Vendors — the third-party risk face (D-BWVENDOR-1, BOR-29) ───────────────
 *
 * TENANT-LEVEL, NOT BOOK-LEVEL. Every other lending panel narrows to one book
 * first; a vendor is a counterparty the whole tenant depends on and carries no
 * book column upstream, so this panel asks for no book and the broker scopes it
 * on the tenant alone. That is the honest shape of the data, not a missing gate.
 *
 * THE STATUS WORDS ARE THE VIEW'S OWN — COMPLETE / LAPSED / NOT STARTED. They
 * are printed exactly as stored and never re-mapped to something softer: the
 * client's file is the spec, and "LAPSED" is the word that makes the point.
 * `sealed` is stated in both directions for the same reason — a false is a fact
 * about the record, not something to leave blank.
 */

/** COMPLETE / LAPSED / NOT STARTED, compared without inventing new vocabulary. */
function statusWord(value: string | null): string {
  return (value ?? "").trim().toUpperCase();
}

/**
 * Sort weight only — never displayed, never recomputed into money.
 *
 * `amount` arrives PRE-FORMATTED from the view ("$1.4M", "$900K"), so ordering by
 * spend needs a number the string does not carry. This reads the magnitude for
 * comparison and nothing else; the cell always prints the string it was given.
 * A value this cannot parse sorts last rather than sorting as zero pretending to
 * be a measurement.
 */
function spendWeight(amount: string | null): number {
  if (!amount) return -1;
  const m = /([\d.]+)\s*([KMB])?/i.exec(amount);
  if (!m) return -1;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return -1;
  const scale = { K: 1e3, M: 1e6, B: 1e9 }[(m[2] ?? "").toUpperCase()] ?? 1;
  return n * scale;
}

/** Critical first, then the largest spend — law money-ranks-first. */
export function sortVendors(rows: LendingVendor[]): LendingVendor[] {
  return [...rows].sort((a, b) => {
    const ac = statusWord(a.tier) === "CRITICAL" ? 0 : 1;
    const bc = statusWord(b.tier) === "CRITICAL" ? 0 : 1;
    if (ac !== bc) return ac - bc;
    return spendWeight(b.amount) - spendWeight(a.amount);
  });
}

/** "N of M complete · K lapsed · J not started" — counted, never estimated. */
export function checklistSummary(items: LendingVendorChecklistItem[]): string {
  const complete = items.filter((i) => statusWord(i.status) === "COMPLETE").length;
  const lapsed = items.filter((i) => statusWord(i.status) === "LAPSED").length;
  const notStarted = items.filter((i) => statusWord(i.status) === "NOT STARTED").length;
  return `${complete} of ${items.length} complete · ${lapsed} lapsed · ${notStarted} not started`;
}

function VendorChecklist({ vendor, onBack }: { vendor: LendingVendor; onBack: () => void }) {
  const [items, setItems] = useState<LendingVendorChecklistItem[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setItems(null);
    setFailed(false);
    listVendorChecklist(vendor.vendorId)
      .then((rows) => {
        if (!cancelled) setItems(rows);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        // Detail to the console only: a broker code can name a resource.
        console.warn("[vendors panel] checklist load failed", e);
        setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [vendor.vendorId]);

  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="mb-2 text-[12px] underline underline-offset-2"
        style={{ color: LD.inkMuted }}
      >
        ← All vendors
      </button>

      {failed ? (
        <LdEmpty line="That checklist could not be loaded just now." />
      ) : items === null ? (
        <LdNote>Loading {vendor.name}&rsquo;s checklist…</LdNote>
      ) : (
        <>
          <LdNote>{checklistSummary(items)}</LdNote>
          <EvidenceTable
            rows={items}
            emptyLine={`No checklist items recorded for ${vendor.name}.`}
            columns={[
              { key: "title", header: "Item", cell: (i) => i.title },
              // The view's own word, printed as stored.
              { key: "status", header: "Status", cell: (i) => i.status ?? "—" },
              // Said in both directions — a false is a fact, not a blank.
              { key: "sealed", header: "Sealed", cell: (i) => (i.sealed ? "yes" : "no") },
              { key: "detail", header: "Detail", cell: (i) => i.detail ?? "—" },
              {
                key: "recorded",
                header: "Recorded",
                muted: true,
                cell: (i) => dateOnly(i.recordedAt),
              },
            ]}
          />
        </>
      )}
    </div>
  );
}

export function VendorsView({ vendors }: { vendors: LendingVendor[] }) {
  const [openVendorId, setOpenVendorId] = useState<string | null>(null);
  const open = vendors.find((v) => v.vendorId === openVendorId) ?? null;

  if (open) return <VendorChecklist vendor={open} onBack={() => setOpenVendorId(null)} />;

  return (
    <EvidenceTable
      rows={sortVendors(vendors)}
      emptyLine="No vendors recorded for this tenant."
      columns={[
        {
          key: "name",
          header: "Vendor",
          cell: (v) => (
            <button
              type="button"
              onClick={() => setOpenVendorId(v.vendorId)}
              className="underline underline-offset-2"
            >
              {v.name}
            </button>
          ),
        },
        { key: "tier", header: "Tier", cell: (v) => v.tier ?? "—" },
        // Printed exactly as the view formatted it. Never re-derived.
        { key: "amount", header: "Annual spend", align: "right", cell: (v) => v.amount ?? "—" },
        {
          key: "checklist",
          header: "Checklist",
          align: "right",
          cell: (v) => `${v.done}/${v.total}`,
        },
        { key: "status", header: "Status", muted: true, cell: (v) => v.status ?? "—" },
      ]}
    />
  );
}

export const VENDORS_EXPLAIN: LdExplainCopy = {
  what: "Every third party this book depends on, and where each one stands against your policy's checklist.",
  next: "Open anything LAPSED — that is evidence that has gone stale, not a task someone forgot.",
  nextWhenEmpty: "No vendors recorded for this tenant.",
};

export function VendorsPanel() {
  // No book id: this resource is tenant-scoped, so the panel does not wait for
  // an entity selection the way the four evidence panels do.
  const load = useCallback(() => listVendors(), []);
  const { state } = useLendingData<LendingVendor[]>(load, { requiresBook: false });

  return (
    <LdPanelFrame
      title="Vendors"
      subject="vendors"
      state={state}
      explain={VENDORS_EXPLAIN}
      countOf={(rows) => rows.length}
      render={(vendors) => <VendorsView vendors={vendors} />}
    />
  );
}
