import { useMemo, useState } from "react"

/**
 * THE LABOUR SHEET.
 *
 * The one section on this page a visitor can argue with, which is the reason it
 * is interactive rather than a static figure. Every cell is theirs to change:
 * how many of a thing, how often, how long it takes, what an hour costs, how
 * many lenders and how many licensed states they carry. The total that results
 * is their own arithmetic, not ours, and it is the cost of assembling evidence
 * BY HAND — not a price for anything.
 *
 * The defaults are deliberately conservative. A sheet that has to exaggerate to
 * make its point loses the argument the moment someone edits a cell.
 */

interface Row {
  key: string
  what: string
  /** How many of the thing, per period. */
  qty: number
  /** Times per year that quantity recurs. */
  perYear: number
  /** Hours each one takes to assemble by hand. */
  hrsEach: number
  /** Multiplied by the number of lender books. */
  perLender?: boolean
  /** Multiplied by the number of licensed states. */
  perState?: boolean
  note: string
}

const ROWS: Row[] = [
  {
    key: "state-filings",
    what: "State regulator filings",
    qty: 1,
    perYear: 4,
    hrsEach: 12,
    perState: true,
    note: "quarterlies and annuals, per licensed state",
  },
  {
    key: "exam-response",
    what: "Exam and audit responses",
    qty: 1,
    perYear: 2,
    hrsEach: 60,
    note: "pulling, sampling, reconciling, cover memo",
  },
  {
    key: "complaint",
    what: "Complaint responses",
    qty: 6,
    perYear: 12,
    hrsEach: 1.5,
    note: "per response, from the account record outward",
  },
  {
    key: "interaction-qa",
    what: "Contact review",
    qty: 200,
    perYear: 12,
    hrsEach: 0.08,
    note: "sampled review at 3% of monitored contacts",
  },
  {
    key: "control-evidence",
    what: "Control evidence packs",
    qty: 1,
    perYear: 4,
    hrsEach: 16,
    perLender: true,
    note: "per book, per quarter",
  },
  {
    key: "discovery",
    what: "Production and discovery sets",
    qty: 1,
    perYear: 2,
    hrsEach: 24,
    note: "assembling and re-assembling a citable set",
  },
]

const HOURS_PER_FTE = 2080

function money(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  })
}

export function LaborSheet() {
  const [rate, setRate] = useState(58)
  const [lenders, setLenders] = useState(4)
  const [states, setStates] = useState(9)
  const [hrs, setHrs] = useState<Record<string, number>>(
    Object.fromEntries(ROWS.map((r) => [r.key, r.hrsEach])),
  )
  const [qty, setQty] = useState<Record<string, number>>(
    Object.fromEntries(ROWS.map((r) => [r.key, r.qty])),
  )

  const lines = useMemo(
    () =>
      ROWS.map((r) => {
        const multiplier = (r.perLender ? lenders : 1) * (r.perState ? states : 1)
        const hours = (qty[r.key] ?? 0) * r.perYear * (hrs[r.key] ?? 0) * multiplier
        return { row: r, multiplier, hours, cost: hours * rate }
      }),
    [hrs, qty, lenders, states, rate],
  )

  const totalHours = lines.reduce((a, l) => a + l.hours, 0)
  const totalCost = totalHours * rate
  const fte = totalHours / HOURS_PER_FTE

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 18, marginBottom: 14 }}>
        <Input label="Loaded hourly rate" value={rate} onChange={setRate} prefix="$" />
        <Input label="Lender books" value={lenders} onChange={setLenders} />
        <Input label="Licensed states" value={states} onChange={setStates} />
      </div>

      <div style={{ overflowX: "auto" }}>
        <table className="sheet">
          <thead>
            <tr>
              <th>Work</th>
              <th className="num">How many</th>
              <th className="num">Times a year</th>
              <th className="num">Hours each</th>
              <th className="num">×</th>
              <th className="num">Hours a year</th>
              <th className="num">Cost a year</th>
            </tr>
          </thead>
          <tbody>
            {lines.map(({ row, multiplier, hours, cost }) => (
              <tr key={row.key}>
                <td>
                  <span style={{ color: "var(--ink)" }}>{row.what}</span>
                  <br />
                  <span style={{ color: "var(--faint)", fontSize: 11 }}>{row.note}</span>
                </td>
                <td className="num">
                  <input
                    type="number"
                    min={0}
                    value={qty[row.key]}
                    onChange={(e) =>
                      setQty({ ...qty, [row.key]: Math.max(0, Number(e.target.value)) })
                    }
                    aria-label={`How many ${row.what}`}
                  />
                </td>
                <td className="num">{row.perYear}</td>
                <td className="num">
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={hrs[row.key]}
                    onChange={(e) =>
                      setHrs({ ...hrs, [row.key]: Math.max(0, Number(e.target.value)) })
                    }
                    aria-label={`Hours each for ${row.what}`}
                  />
                </td>
                <td className="num">{multiplier === 1 ? "—" : `${multiplier}`}</td>
                <td className="num">{Math.round(hours).toLocaleString("en-US")}</td>
                <td className="num">{money(cost)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid3" style={{ marginTop: 18 }}>
        <Total label="Hours a year" value={Math.round(totalHours).toLocaleString("en-US")} />
        <Total label="Full-time equivalent" value={fte.toFixed(2)} />
        <Total label="Cost a year" value={money(totalCost)} />
      </div>

      <p style={{ marginTop: 14, fontSize: 13 }}>
        None of that work disappears. It stops being assembled. The rows exist as they happen,
        the filings render from them, and the hours above go back to the people who were
        spending them.
      </p>
    </div>
  )
}

function Input({
  label,
  value,
  onChange,
  prefix,
}: {
  label: string
  value: number
  onChange: (n: number) => void
  prefix?: string
}) {
  return (
    <label style={{ display: "block" }}>
      <span className="eyebrow" style={{ display: "block", marginBottom: 4 }}>
        {label}
      </span>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--faint)" }}>
        {prefix}
      </span>
      <input
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value)))}
        style={{
          width: 92,
          fontFamily: "var(--font-mono)",
          fontSize: 14,
          padding: "5px 8px",
          border: "1px solid var(--line)",
          borderRadius: 6,
          background: "var(--page)",
          color: "var(--ink)",
          textAlign: "right",
        }}
      />
    </label>
  )
}

function Total({ label, value }: { label: string; value: string }) {
  return (
    <div className="pane" style={{ padding: "14px 16px" }}>
      <div className="eyebrow eyebrow-on-navy">{label}</div>
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 30,
          marginTop: 4,
          color: "var(--oninv)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
    </div>
  )
}
