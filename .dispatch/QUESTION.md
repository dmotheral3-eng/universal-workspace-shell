# CONFLICT — BOR-33 fix already applied

**Task:** BOR-33 — derive availablePanelTypes from panel-manifest.json, not hardcoded literal  
**Branch:** claude/6416e14b  
**Checked:** 2026-08-30

## Conflict

The task filing describes the bug as live in `src/shell/workspace-header.tsx`. However, that fix was already merged into `main` by commit `527958b` ("BOR-33: derive availablePanelTypes from manifest, not hardcoded literal (#32)").

Current `workspace-header.tsx` (lines 21–38) already:

1. Keeps `ALL_PANEL_TYPES` as an ordering hint only (comment on line 19 says so)
2. Derives `MANIFEST_PANEL_TYPES = Object.keys(panelManifest)` (line 25)
3. Builds `ORDERED_PANELS` = hint-ordered manifest keys + any manifest key not in hint (lines 27–30)
4. `availablePanelTypes()` filters `ORDERED_PANELS` by the profile's `panels` array, with empty-profile fallback returning `ORDERED_PANELS` (lines 34–38)

Per the task protocol: "IF THE PROMPT CONFLICTS WITH WHAT YOU FIND IN THE WORLD — for example if the literal has already been changed — STOP without writing and record the conflict in this row instead of improvising."

## All three required probes — run against current main

### PROBE 1 — FORWARD: borrowworks profile

`availablePanelTypes()` with `borrowworks.config.json` (panels = ["Books","Decisions","Interactions","Changes","Attestations"]):

```
["Attestations","Books","Changes","Decisions","Interactions"]
```

All five BorrowWorks panels are returned (order follows ORDERED_PANELS: hint-ordered first, then manifest-alpha for unhindered keys).

### PROBE 2 — NO REGRESSION: lawdog + spectrum

The spectrum face is configured via `lawdog.config.json` (`"face": "spectrum"`); both share the same panels array.

**PRE-CHANGE** (using old `ALL_PANEL_TYPES` literal as the universe):
```
["EntityList","MatterHome","ItemTable","ReadingPane","ChatRail","StageTracker","DocBrowser","MetricGrid","MasterBoard","CoverageMatrix","Parties","Rates","Savings","Subpoenas","ClaimValue","RecoveryOutlook","Ledger","MasterCaseDoc"]
```

**POST-CHANGE** (using `ORDERED_PANELS` as the universe):
```
["EntityList","MatterHome","ItemTable","ReadingPane","ChatRail","StageTracker","DocBrowser","MetricGrid","MasterBoard","CoverageMatrix","Parties","Rates","Savings","Subpoenas","ClaimValue","RecoveryOutlook","Ledger","MasterCaseDoc"]
```

**Identical: TRUE** — no regression on LawDog or Spectrum.

### PROBE 3 — EMPTY-PROFILE FALLBACK

A profile with no `panels` declared gets the full `ORDERED_PANELS` set:
```
["InboxBoard","WhereWeAre","EntityList","MatterHome","ItemTable","ReadingPane","ChatRail","StageTracker","DocBrowser","MetricGrid","MasterBoard","CoverageMatrix","Parties","Rates","Savings","Subpoenas","ClaimValue","RecoveryOutlook","Ledger","MasterCaseDoc","Attestations","Books","Changes","Decisions","Interactions"]
```
Length: 25 (matches all 25 manifest entries). Fallback preserved.

## Question for human

**Is this row stale?** The fix appears complete and all three required probes pass. Should this dispatch row be closed as already-done, or is there additional work expected that was not captured in the commit?

If the row should be reopened for a different reason (e.g., the PR #32 was reverted, or CI is failing), please re-file with updated context.
