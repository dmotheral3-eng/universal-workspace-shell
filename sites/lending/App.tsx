import { ScanRegister } from "@/bw/scan-register"

import { LaborSheet } from "./labor-sheet"
import { JURISDICTION_CHIPS, RULEBOOK_CHIPS, SPECIMEN_BOOK, SPECIMEN_ROWS } from "./specimen"
import { track } from "./analytics"

/**
 * THE PUBLIC LENDING SURFACE.
 *
 * General-purpose throughout: no client is named, no client's policy is quoted,
 * no third party is named in any tier of the field, and every product visual is
 * a fictional specimen that says so in its own frame. The field is described as
 * TIERS — systems of action, systems of decision, systems of record — because
 * naming vendors on a public page is a fight we do not need and an invitation to
 * be read as a competitor rather than a layer.
 *
 * The hero renders the REAL operator component over specimen rows rather than a
 * screenshot of it. A screenshot goes stale the day the product moves; this one
 * cannot, because it IS the product, and if the register changes shape the
 * marketing page changes with it.
 */

function Section({
  id,
  eyebrow,
  children,
  tint,
}: {
  id?: string
  eyebrow?: string
  children: React.ReactNode
  tint?: boolean
}) {
  return (
    <section
      id={id}
      style={{
        padding: "72px 0",
        background: tint ? "var(--page2)" : "var(--page)",
        borderTop: "1px solid var(--line)",
      }}
    >
      <div className="wrap">
        {eyebrow && <div className="eyebrow" style={{ marginBottom: 14 }}>{eyebrow}</div>}
        {children}
      </div>
    </section>
  )
}

function SpecimenFrame({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="specimen">
      <div className="specimen-bar">
        <span className="eyebrow">{title}</span>
        <span className="chip chip-gold">fictional specimen</span>
      </div>
      <div className="specimen-body">{children}</div>
    </div>
  )
}

/* ── the six askers ──────────────────────────────────────────────────────────
 * The solution formula, one section each: outcome headline, exactly three
 * mechanism bullets, a specimen visual. Three is the discipline — a fourth
 * bullet is always the one nobody reads, and cutting to three is what forces
 * the mechanism to be named instead of gestured at. */

interface Asker {
  key: string
  who: string
  headline: string
  bullets: [string, string][]
  visual: React.ReactNode
}

function MiniRows({ rows }: { rows: [string, string, string][] }) {
  return (
    <table className="sheet">
      <tbody>
        {rows.map(([a, b, c]) => (
          <tr key={a + b}>
            <td style={{ color: "var(--ink)" }}>{a}</td>
            <td>{b}</td>
            <td className="num">{c}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

const ASKERS: Asker[] = [
  {
    key: "state",
    who: "State regulators, every licensed state",
    headline: "The filing is a render, not a project.",
    bullets: [
      ["A template row per form", "form reference, due rule and location scope live as rows, so a new state is a row rather than a build."],
      ["Clocks that run themselves", "each filing has a window that opens before it is due, and an amber state a human can see coming."],
      ["The filed copy is kept", "portals do not hand back what you sent, so the rendered document is hashed and archived on the way out."],
    ],
    visual: (
      <MiniRows
        rows={[
          ["Quarterly · §393.627", "window open", "due Jan 31"],
          ["Annual report", "amber", "due Jan 31"],
          ["Licence renewal", "filed · hash kept", "Dec 31"],
          ["Call report", "window open", "due Apr 30"],
        ]}
      />
    ),
  },
  {
    key: "bureau",
    who: "The consumer bureau",
    headline: "The answer existed before the letter did.",
    bullets: [
      ["Every contact scored", "not a sample. Coverage is a number you can state, and absence is proven rather than assumed."],
      ["Disposition on the row", "in review, escalated, coached, closed — the outcome of a flag lives beside the flag."],
      ["The clock is a row too", "response windows are tracked as obligations, so a stalled file is visible while it can still be moved."],
    ],
    visual: (
      <SpecimenFrame title="contact review">
        <ScanRegister
              rows={SPECIMEN_ROWS}
              bookLabel={SPECIMEN_BOOK}
              onOpen={() => {}}
              headingAs="h3"
            />
      </SpecimenFrame>
    ),
  },
  {
    key: "principals",
    who: "Lender principals",
    headline: "Their book, their rows, their name on the database.",
    bullets: [
      ["A book per lender", "isolation is enforced at the row, not by a filter someone remembered to apply."],
      ["Their policy, not a template", "the rulebook carries their section numbers, still attached, still quotable."],
      ["They can read it directly", "the record is theirs; nothing about it requires our surface to be the way in."],
    ],
    visual: (
      <MiniRows
        rows={[
          ["Book A", "1,284 contacts · 41 flagged", "100%"],
          ["Book B", "  902 contacts · 18 flagged", "100%"],
          ["Book C", "2,117 contacts · 63 flagged", "100%"],
          ["Book D", "  436 contacts ·  9 flagged", "100%"],
        ]}
      />
    ),
  },
  {
    key: "ai",
    who: "Your own AI policy",
    headline: "The machine reads everything; people decide the exceptions.",
    bullets: [
      ["Model version on the decision", "which version scored it is part of the record, not a deployment note somebody kept."],
      ["A human review is a row", "upheld or overturned, named, timed — an override that leaves no row is not an override."],
      ["Rule changes carry evidence", "a promotion is a change request with its impact and its blast radius attached."],
    ],
    visual: (
      <MiniRows
        rows={[
          ["DEC-…9104", "approved · scored v4.2.1", "upheld"],
          ["DEC-…9237", "declined · scored v4.3.0", "overturned"],
          ["DEC-…8812", "declined · scored v4.2.1", "upheld"],
          ["rule v7 → v8", "backtest attached", "held"],
        ]}
      />
    ),
  },
  {
    key: "counsel",
    who: "Opposing counsel",
    headline: "A production set that reproduces byte for byte.",
    bullets: [
      ["Cited, not summarised", "every line in a set names the row it came from, so the set can be checked rather than believed."],
      ["Re-runnable", "the same request on the same day returns the same bytes, and the hash says so."],
      ["Nothing is edited", "corrections are new rows pointing at what they correct; the earlier version does not vanish."],
    ],
    visual: (
      <MiniRows
        rows={[
          ["Set 2027-0114", "312 rows · manifest", "hash 8f3c…"],
          ["re-run 2027-0119", "312 rows · manifest", "hash 8f3c…"],
          ["correction", "supersedes row 118", "kept"],
        ]}
      />
    ),
  },
  {
    key: "audit",
    who: "Internal audit",
    headline: "Controls counted, not sampled.",
    bullets: [
      ["Every control, its evidence", "green, amber and red are computed from rows, not asserted in a spreadsheet."],
      ["The refusals are evidence too", "a gate that turned work away leaves a row saying what it refused and why."],
      ["One record, many views", "the dashboard, the calendar and the filing are the same rows read three ways."],
    ],
    visual: (
      <MiniRows
        rows={[
          ["Contact review", "evidenced", "green"],
          ["Filing calendar", "2 windows open", "amber"],
          ["Rule promotion", "backtest missing", "red"],
          ["Refusals this month", "14 recorded", "—"],
        ]}
      />
    ),
  },
]

function AskerSection({ asker, index }: { asker: Asker; index: number }) {
  const flip = index % 2 === 1
  return (
    <div
      className="grid2"
      style={{ padding: "34px 0", borderTop: index === 0 ? "none" : "1px solid var(--line)" }}
    >
      <div style={{ order: flip ? 2 : 1 }}>
        <div className="eyebrow">{asker.who}</div>
        <h2 style={{ marginTop: 10 }}>{asker.headline}</h2>
        <ul style={{ listStyle: "none", padding: 0, margin: "18px 0 0" }}>
          {asker.bullets.map(([name, body]) => (
            <li key={name} style={{ marginBottom: 12 }}>
              <strong style={{ color: "var(--ink)", fontWeight: 600 }}>{name}</strong>
              <span style={{ color: "var(--body)" }}> — {body}</span>
            </li>
          ))}
        </ul>
      </div>
      <div style={{ order: flip ? 1 : 2 }}>{asker.visual}</div>
    </div>
  )
}

/* ── the layered stack ───────────────────────────────────────────────────────
 * One image that has to say two things at once: nothing you run today is
 * replaced, and everything above the record is a view of it. */
function StackDiagram() {
  const layers = [
    { label: "Lenses", body: "operator desk · calendar · filings · the graph · your warehouse", tone: "sage" },
    { label: "Mechanisms", body: "the walker · the gate · the renderer · the obligation engine", tone: "gold" },
    { label: "The record", body: "in your database, under your name", tone: "navy" },
    { label: "The systems you already run", body: "servicing · dialer · decisioning · document store — untouched", tone: "plain" },
  ]
  return (
    <div>
      {layers.map((l, i) => (
        <div
          key={l.label}
          style={{
            margin: `0 ${i * 14}px 10px`,
            padding: "14px 18px",
            borderRadius: 10,
            border: "1px solid",
            borderColor:
              l.tone === "navy"
                ? "var(--navyline)"
                : l.tone === "gold"
                  ? "var(--gold-deep)"
                  : l.tone === "sage"
                    ? "var(--sage-deep)"
                    : "var(--line)",
            background:
              l.tone === "navy"
                ? "var(--navypane)"
                : l.tone === "gold"
                  ? "var(--gold-soft)"
                  : l.tone === "sage"
                    ? "var(--sage-soft)"
                    : "var(--page2)",
            color: l.tone === "navy" ? "var(--oninv)" : "var(--ink)",
          }}
        >
          <div
            className="eyebrow"
            style={{ color: l.tone === "navy" ? "var(--oninvmute)" : "var(--faint)" }}
          >
            {l.label}
          </div>
          <div style={{ marginTop: 3, fontSize: 14 }}>{l.body}</div>
        </div>
      ))}
      <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
        <span className="chip chip-sage">no migration</span>
        <span className="chip chip-gold">one record, many views</span>
      </div>
    </div>
  )
}

const MACHINERY = [
  {
    name: "the Walker",
    what: "Reads every monitored contact against the policy in force on the day it happened.",
    out: "coverage you can state, and absence you can prove",
  },
  {
    name: "the Gate",
    what: "Refuses work that would leave the record unable to explain itself.",
    out: "a refusal is a row, with what it stopped and why",
  },
  {
    name: "the Renderer",
    what: "Turns rows into the document a particular asker is entitled to.",
    out: "the same request returns the same bytes, and says so",
  },
]

export default function App() {
  return (
    <>
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          background: "rgb(var(--page-rgb) / 0.92)",
          backdropFilter: "blur(8px)",
          borderBottom: "1px solid var(--line)",
        }}
      >
        <div
          className="wrap"
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            padding: "14px 24px",
          }}
        >
          <span style={{ fontFamily: "var(--font-display)", fontSize: 18 }}>Centripetal</span>
          <nav style={{ display: "flex", gap: 18, fontSize: 13 }}>
            <a href="#what" style={{ textDecoration: "none", color: "var(--body)" }}>What it is</a>
            <a href="#asks" style={{ textDecoration: "none", color: "var(--body)" }}>Who asks</a>
            <a href="#work" style={{ textDecoration: "none", color: "var(--body)" }}>The work it removes</a>
            <a href="#talk" style={{ textDecoration: "none", color: "var(--ink)" }}>Talk to us</a>
          </nav>
        </div>
      </header>

      {/* ── hero ── */}
      <section style={{ padding: "76px 0 64px" }}>
        <div className="wrap grid2 hero-grid">
          <div>
            <div className="eyebrow">the evidence layer for consumer lending</div>
            <h1 style={{ marginTop: 16 }}>
              Every interaction. Every decision. <span className="gold">One record.</span>
            </h1>
            <p style={{ marginTop: 18, fontSize: 17, maxWidth: "44ch" }}>
              Not a report you assemble when someone asks. A record that already holds the answer,
              in a database with your name on it, that renders whatever the asker is entitled to.
            </p>
            <div style={{ display: "flex", gap: 10, marginTop: 26, flexWrap: "wrap" }}>
              <a className="btn" href="#talk" onClick={() => track("hero_cta_clicked")}>
                Talk to us
              </a>
              <a className="btn btn-quiet" href="#what">
                See how it is put together
              </a>
            </div>
          </div>
          <SpecimenFrame title="the operator desk · contact review">
            <ScanRegister
              rows={SPECIMEN_ROWS}
              bookLabel={SPECIMEN_BOOK}
              onOpen={() => {}}
              headingAs="h3"
            />
          </SpecimenFrame>
        </div>
      </section>

      {/* ── the inversion ── */}
      <Section>
        <h2 style={{ maxWidth: "26ch" }}>
          Platforms ask to connect to your database. We hand you one that&rsquo;s already yours.
        </h2>
        <p style={{ marginTop: 16, maxWidth: "62ch" }}>
          The record lives in your infrastructure, under your credentials, with your retention
          policy. If we disappeared tomorrow the rows would still be there and still be readable.
          That is not a promise about our conduct. It is a property of where the data sits.
        </p>
      </Section>

      {/* ── what it is: the stack ── */}
      <Section id="what" eyebrow="what it is" tint>
        <div className="grid2">
          <div>
            <h2>Nothing you run today is replaced.</h2>
            <p style={{ marginTop: 16 }}>
              The servicing system keeps servicing. The dialer keeps dialling. Whatever decides
              keeps deciding. Underneath all of it, the record captures what happened and what was
              decided — and everything above it is a view of those same rows.
            </p>
            <p style={{ marginTop: 14 }}>
              That is why there is no migration to plan and no cutover weekend. The layer arrives
              beside what you have rather than in place of it.
            </p>
          </div>
          <StackDiagram />
        </div>
      </Section>

      {/* ── chips ── */}
      <Section eyebrow="breadth, at a glance">
        <div className="grid2" style={{ alignItems: "start" }}>
          <div>
            <h3>The rulebook is yours, row by row</h3>
            <p style={{ margin: "10px 0 14px", fontSize: 14 }}>
              Not a generic template. Your policy, with the section numbers still attached, so a
              flag can be traced back to the sentence that produced it.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
              {RULEBOOK_CHIPS.map((c) => (
                <span key={c} className="chip">{c}</span>
              ))}
            </div>
          </div>
          <div>
            <h3>Filed where you are licensed</h3>
            <p style={{ margin: "10px 0 14px", fontSize: 14 }}>
              Each jurisdiction is template rows carrying a form reference, a due rule and a
              location scope. Adding a state is a row, not a release.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
              {JURISDICTION_CHIPS.map((c) => (
                <span key={c} className="chip chip-sage">{c}</span>
              ))}
            </div>
          </div>
        </div>
      </Section>

      {/* ── the six askers ── */}
      <Section id="asks" eyebrow="six people ask for six different things" tint>
        <h2 style={{ maxWidth: "28ch" }}>One record. Six answers, and none of them assembled.</h2>
        <div style={{ marginTop: 26 }}>
          {ASKERS.map((a, i) => (
            <AskerSection key={a.key} asker={a} index={i} />
          ))}
        </div>
      </Section>

      {/* ── named machinery ── */}
      <Section eyebrow="the machinery, by name">
        <div className="grid3">
          {MACHINERY.map((m) => (
            <div
              key={m.name}
              style={{
                border: "1px solid var(--line)",
                borderRadius: 12,
                padding: 20,
                background: "var(--page)",
              }}
            >
              <h3 style={{ fontFamily: "var(--font-display)" }}>{m.name}</h3>
              <p style={{ marginTop: 10, fontSize: 14 }}>{m.what}</p>
              <p style={{ marginTop: 12, fontSize: 13, color: "var(--sage-deep)" }}>↳ {m.out}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* ── the field, as tiers ── */}
      <Section eyebrow="where this sits" tint>
        <div className="grid3">
          {[
            ["Systems of action", "They run the loan: servicing, dialling, collecting. They record what they did, in their own shape, for their own purpose."],
            ["Systems of decision", "They decide: score, price, approve, prioritise. They explain the decision to you, inside their product, on their terms."],
            ["Systems of record", "This one. It proves what the other two did, in a form an outsider can check — and it belongs to the lender, not the vendor."],
          ].map(([h, b], i) => (
            <div
              key={h}
              className={i === 2 ? "pane" : undefined}
              style={{
                padding: 20,
                borderRadius: 12,
                border: i === 2 ? undefined : "1px solid var(--line)",
                background: i === 2 ? undefined : "var(--page)",
              }}
            >
              <div
                className={i === 2 ? "eyebrow eyebrow-on-navy" : "eyebrow"}
              >
                {i === 2 ? "the seat we hold" : "adjacent"}
              </div>
              <h3
                style={{ marginTop: 8, color: i === 2 ? "var(--oninv)" : "var(--ink)" }}
              >
                {h}
              </h3>
              <p style={{ marginTop: 10, fontSize: 14, color: i === 2 ? "var(--oninvmute)" : "var(--body)" }}>
                {b}
              </p>
            </div>
          ))}
        </div>
        <p style={{ marginTop: 20, maxWidth: "64ch" }}>
          A lender usually needs all three, and the ones already running a decision system need
          this one more rather than less — the faster something acts on your behalf, the shorter
          the gap between an action and the evidence that it was allowed.
        </p>
      </Section>

      {/* ── labour sheet ── */}
      <Section id="work" eyebrow="the work it removes">
        <div style={{ maxWidth: "62ch" }}>
          <h2>Count it yourself.</h2>
          <p style={{ marginTop: 14 }}>
            Every cell below is editable. Put your own numbers in — how many books, how many
            licensed states, what an hour costs you — and read the total. This is your cost of
            assembling evidence by hand, not a price for anything.
          </p>
        </div>
        <div style={{ marginTop: 26 }}>
          <LaborSheet />
        </div>
      </Section>

      {/* ── commercial shape + door ── */}
      <Section id="talk" tint>
        <div className="grid2">
          <div>
            <h2>What it costs</h2>
            <p style={{ marginTop: 14 }}>
              One engagement fee to stand the record up in your infrastructure, then an annual
              subscription that scales with the number of lender books and licensed states you
              carry. Every filing template for every state you are licensed in is included — there
              is no per-filing charge, because a per-filing charge would price you out of being
              thorough.
            </p>
            <p style={{ marginTop: 14 }}>
              The shape is simple; the number depends on your book. Tell us what you carry and we
              will tell you the number in the first conversation.
            </p>
          </div>
          <div className="pane" style={{ padding: 26 }}>
            <div className="eyebrow eyebrow-on-navy">start here</div>
            <h3 style={{ color: "var(--oninv)", marginTop: 10 }}>
              Bring one book and one exam you have been through.
            </h3>
            <p style={{ marginTop: 12, fontSize: 14, color: "var(--oninvmute)" }}>
              We will walk the record against it and show you which questions it already answers.
              No connection to your systems is required for that conversation.
            </p>
            <a
              className="btn"
              href="mailto:hello@centripetal-ai.com?subject=The%20record%20layer"
              onClick={() => track("contact_clicked")}
              style={{
                marginTop: 18,
                background: "var(--gold)",
                borderColor: "var(--gold)",
                color: "var(--navy)",
              }}
            >
              hello@centripetal-ai.com
            </a>
          </div>
        </div>
      </Section>

      {/* ── AI-readable self-description ──
          Assistants get asked what this is far more often than people read the
          hero. The canonical sentence lives here in prose AND in llms.txt, worded
          identically, so a machine quoting us quotes the thing we chose. */}
      <Section eyebrow="canonical description">
        <div
          id="ai-readable"
          style={{
            border: "1px solid var(--line)",
            borderRadius: 12,
            padding: 24,
            background: "var(--page)",
            maxWidth: "76ch",
          }}
        >
          <h3>What Centripetal is, in one paragraph</h3>
          <p style={{ marginTop: 12 }}>
            Centripetal builds a <strong>client-owned evidence layer</strong> for consumer lending.
            It is a system of record that sits beside the systems a lender already runs and
            captures every monitored interaction and every decision as rows in a database the
            lender owns. Regulatory filings, exam responses, complaint responses, control
            dashboards and production sets are rendered from those rows on demand rather than
            assembled by hand. It does not originate, service, price or decide; it proves what the
            systems that do those things actually did, in a form an outsider can check.
          </p>
          <p style={{ marginTop: 12, fontSize: 13, color: "var(--faint)" }}>
            The same text is served at{" "}
            <a href="/llms.txt" style={{ color: "var(--gold-deep)" }}>/llms.txt</a>.
          </p>
        </div>
      </Section>

      <footer style={{ borderTop: "1px solid var(--line)", padding: "28px 0 44px" }}>
        <div
          className="wrap"
          style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}
        >
          <span className="eyebrow">Centripetal · the record layer for consumer lending</span>
          <span className="eyebrow">
            every product visual on this page is a fictional specimen
          </span>
        </div>
      </footer>
    </>
  )
}
