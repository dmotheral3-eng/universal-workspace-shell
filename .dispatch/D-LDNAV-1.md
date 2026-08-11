# D-LDNAV-1 — Matter home cards wired to real panel navigation

Reported by Dave, live screenshot 2026-08-11: every "Open the X →" on the Matter
home card grid, and every stat figure, did nothing on click. The panel strip
worked; the cards never reached it.

## Root cause

The cards were not missing handlers. `SectionCard` already had `onClick={go(panel)}`,
and `go` already called `openPanel`. The bug was one line inside `openPanel`:

```ts
if (isPanelVisible(panelType)) return;   // src/shell/layout-context.tsx
```

`isPanelVisible` means "is this panel a tab anywhere in the tree", not "is it on
screen". In the Classic layout the centre leaf is `Matter home · Evidence ·
Timeline · Reading Pane` — four tabs, one leaf. So Evidence and Timeline were
always "visible", `openPanel` always returned early, and the two most-clicked
cards on the screen were inert by construction. Ask was inert the same way (the
rail is its own leaf, always present). The cards pointing at panels genuinely
absent from the tree did mount something — into a ~12%-wide sliver split off the
Ask rail — and then sat empty, because of the second half of the defect:

`go` re-announced `entity.selected` synchronously, in the same tick as the state
update that mounts the panel. A panel subscribes in an effect that runs *after*
the click handler returns, so a freshly-mounted panel never heard the
announcement and stayed on "nothing selected".

## The fix

One mechanism, `focusPanel(panelType)` in `layout-context`, backed by the pure
`resolvePanelTarget()` in `layout-tree`: background tab → raise it, collapsed →
restore it, absent → mount it. The tab strip's own switcher was extracted to
`setActiveTab(leafId, index)` on the same context and the strip now calls that,
so there is one panel-navigation mechanism in the shell and not two. `openPanel`
is that same function under its old name, so every other caller
(`reading-pane`'s "Open the evidence", `item-table`'s, `stage-tracker`'s,
`metric-grid`'s) gets the fix too.

The re-announce is now replayed on the next macrotask whenever a click actually
mounted or restored a panel, so a panel opened from a card arrives with its data.

## Every CTA and its wired destination

| CTA on Matter home | Element | Destination |
| --- | --- | --- |
| "Ask a question →" (Ask card) | `<button>` | ChatRail raised, then `ask.focus` → cursor in the Ask input |
| "Ask about this matter" (primary action) | `<button>` | same as above |
| "Open the evidence →" | `<button>` | DocBrowser |
| stat "114 documents" | `<button>` | DocBrowser, filter cleared |
| chip "Reviewed n" | `<button>` | DocBrowser, filtered to reviewed |
| chip "Pending 77" | `<button>` | DocBrowser, filtered to unreviewed |
| chip "Flagged n" | `<button>` | DocBrowser, filtered to flagged |
| "Review pending evidence" / "See the flagged evidence" (secondary action) | `<button>` | DocBrowser, filtered to pending / flagged to match its own label |
| "Open the timeline →" | `<button>` | ItemTable |
| stat "17 entries" | `<button>` | ItemTable |
| "Open the stages →" | `<button>` | StageTracker (restored from the collapsed rail) |
| stat "n stages" | `<button>` | StageTracker |
| "Open the people →" | `<button>` | Parties |
| "Open the subpoenas →" | `<button>` | Subpoenas |
| "Open the outlook →" | `<button>` | RecoveryOutlook |
| "Open the claim values →" | `<button>` | ClaimValue |
| "Open the coverage screen →" | `<button>` | CoverageMatrix |
| each tile in "The numbers" | `<button>` | MetricGrid |
| "Open the full metrics panel →" | `<button>` | MetricGrid |

**Disabled + reason: none.** Every card target is a real panel in
`src/registry`, and a card whose panel the active profile does not register is
dropped from the grid rather than shown dead (the mock profile drops the six
legal cards this way). The disabled affordance is built and available — omit
`onOpen` and `SectionCard` renders a `<button disabled>` reading
"… — not built yet" with the reason as its tooltip — for the next card that
outruns its panel.

## Notes

- Two new bus events, both documented in `src/bus/index.ts`: `ask.focus`
  (put the cursor in the Ask box) and `evidence.filter` (arrive at the evidence
  already narrowed to the bucket the clicked count was counting).
- `SectionCard` is no longer one big `<button>`. It could not be: the count and
  chips are their own destinations, and interactive elements may not nest inside
  a button. The card is now a container, the CTA is a button whose `::after`
  stretches over the whole card, and the count/chips sit above it on the z-axis.
  Whole-card click survives; the finer targets win where they overlap.
- Keyboard: every target is a native `<button>`, so Enter/Space activate. All
  carry `aria-label`, `cursor-pointer`, a hover state and a `focus-visible` ring.
- Not fixed, adjacent, flagged rather than silently included: `doc-browser`
  still guards its Reading Pane call with `if (!isPanelVisible(...))`, so
  clicking an evidence tile while the Reading Pane is a background tab in the
  same leaf leaves it hidden. Raising it there means swapping out the panel the
  reader is actively looking at — a call worth making deliberately, not as a
  side effect of this dispatch.

## Verify

- `npm run build` — clean.
- `npm test` — 44 pass, including `src/shell/layout-nav.test.ts`, which pins the
  exact regression: a panel sitting as a background tab must resolve to `raise`,
  not to "already handled".
- Built bundle: `grep -c 'href:"#"'` is 0 across all five chunks; the card CTA
  compiles to `jsxs("button",{type:"button",onClick:u,…})` and the grid call
  site to `actionLabel:M.action,…,onOpen:E(M.panel,M.then)`.
