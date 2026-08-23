/**
 * The pieces every inbox panel shares.
 *
 * THE PROVENANCE FOOTER IS NOT DECORATION (standing rule a5d3167d). Every panel
 * prints the relation it read and the moment it read it. A board without that is
 * a board you have to trust; with it, a wrong number is traceable to a source in
 * one glance instead of a debugging session.
 *
 * AND A FAILED PANEL NEVER LOOKS LIKE AN EMPTY ONE. `SectionBody` renders the
 * error CODE by name when a read failed, and the words "nothing here" only when
 * the read genuinely succeeded and returned nothing. Those two states looking
 * alike is the exact failure the where-are-we board was written against.
 */

import type { ReactNode } from "react";
import type { Section, Light } from "@/data/inbox";

export const LIGHT: Record<Light, { dot: string; bg: string; fg: string; border: string }> = {
  green: { dot: "#3f8f5f", bg: "#eef5f0", fg: "#2c6644", border: "#cfe3d6" },
  amber: { dot: "#b08034", bg: "#f8f2e6", fg: "#7a5a1e", border: "#e8dcc2" },
  red: { dot: "#b4342a", bg: "#f9ece9", fg: "#8a2b22", border: "#eccfc9" },
};

export function Pill({ children, light }: { children: ReactNode; light?: Light }) {
  const c = light ? LIGHT[light] : null;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={
        c
          ? { background: c.bg, color: c.fg, border: `1px solid ${c.border}` }
          : undefined
      }
    >
      {c && <span className="h-2 w-2 rounded-full" style={{ background: c.dot }} />}
      {children}
    </span>
  );
}

export function PanelFrame({
  title,
  count,
  children,
  section,
}: {
  title: string;
  count?: number;
  children: ReactNode;
  section: Section<unknown>;
}) {
  return (
    <section className="rounded-lg border border-border bg-card">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        {typeof count === "number" && (
          <span className="text-xs text-muted-foreground">{count}</span>
        )}
        {section.truncated && (
          <span className="text-[11px] text-muted-foreground">
            showing the first {section.rows.length} — more exist
          </span>
        )}
      </header>

      <div className="px-4 py-3">{children}</div>

      <footer className="border-t border-border px-4 py-2 text-[10px] leading-relaxed text-muted-foreground">
        <span className="font-mono">{section.source}</span> · read{" "}
        {new Date(section.read_at).toLocaleTimeString()}
        {section.caveat && <div className="mt-1">{section.caveat}</div>}
      </footer>
    </section>
  );
}

/** Empty and broken are different states and must read differently. */
export function SectionBody({
  section,
  empty,
  children,
}: {
  section: Section<unknown>;
  empty: string;
  children: ReactNode;
}) {
  if (section.error) {
    return (
      <p className="text-xs text-destructive">
        Could not read this panel&rsquo;s source:{" "}
        <span className="font-mono">{section.error}</span>. Nothing is being hidden — this
        panel simply has no data to show until that read works.
      </p>
    );
  }
  if (section.rows.length === 0) {
    return <p className="text-xs text-muted-foreground">{empty}</p>;
  }
  return <>{children}</>;
}
