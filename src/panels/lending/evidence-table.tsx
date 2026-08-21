import type { ReactNode } from "react";
import { LD, LdEmpty } from "@/panels/legal/ld-kit";

/**
 * The one table shape the four evidence panels share.
 *
 * They differ in their columns and in nothing else, so the table lives here
 * once. Keeping it shared is also what keeps them honest with each other: a
 * change to how a row reads lands in all four at the same time.
 */
export interface EvidenceColumn<T> {
  key: string;
  header: string;
  align?: "left" | "right";
  muted?: boolean;
  cell: (row: T) => ReactNode;
}

export function EvidenceTable<T extends { id: string }>({
  rows,
  columns,
  emptyLine,
}: {
  rows: T[];
  columns: EvidenceColumn<T>[];
  emptyLine: string;
}) {
  if (rows.length === 0) return <LdEmpty line={emptyLine} />;

  return (
    <table className="w-full border-collapse text-[13px]">
      <thead>
        <tr className="border-y" style={{ borderColor: LD.hairline, background: LD.wash }}>
          {columns.map((c) => (
            <th
              key={c.key}
              className={`px-3 py-1.5 font-medium ${c.align === "right" ? "text-right" : "text-left"}`}
            >
              {c.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id} className="border-b" style={{ borderColor: LD.hairline }}>
            {columns.map((c) => (
              <td
                key={c.key}
                className={`px-3 py-1.5 ${c.align === "right" ? "text-right font-mono tabular-nums" : ""}`}
                style={c.muted ? { color: LD.inkMuted } : undefined}
              >
                {c.cell(row) ?? "—"}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * A record that supersedes an earlier one is marked, never merged over it.
 * The evidence tables are append-only upstream, so "corrected" is a visible
 * property of a row rather than a reason to hide the row it replaced.
 */
export function CorrectionMark({ correctsId }: { correctsId: string | null }) {
  if (!correctsId) return null;
  return (
    <span className="ml-1.5 text-[11px]" style={{ color: LD.inkMuted }}>
      corrects an earlier record
    </span>
  );
}
