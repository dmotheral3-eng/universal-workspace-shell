/**
 * THE GENERATED TOKEN BRIDGE — ruling (ii), the named follow-on to declaration 57187cee.
 *
 * The kit's THEMES object BECOMES the shadcn CSS variables. Nothing here is
 * typed by hand and nothing in src/ re-derives a kit colour: this script reads
 * @centripetal/universal-ui/tokens at the pinned commit and emits
 * src/styles/kit-command.css and src/styles/kit-study.css.
 *
 * Ruling (i) still governs the CHROME — the kit's Shell styles itself inline
 * from the same object and is not touched by this file. (ii) is for the PANELS
 * inside it, which are shadcn components and therefore read CSS variables.
 *
 * WHY A GENERATOR AND NOT A CHECKED-IN STYLESHEET: a hand-written mirror of a
 * hashed token block is a second source of truth that drifts silently. This
 * emits the mirror from the source every predev/prebuild, so a stale file
 * cannot ship.
 *
 * HASH DISCIPLINE (step 4). The header of every emitted file carries the
 * THEME_PROVENANCE.block_md5 this run actually read. That md5 is the kit's own
 * claim about the hashed region of tokens.js. If fn_semester_theme_drift's
 * banked md5 ever disagrees with the one stamped in a generated file, THE
 * GENERATED FILE IS THE STALE ONE BY DEFINITION — regenerate before reading it
 * as evidence of anything. The generator never re-hashes and never adjudicates;
 * it records what it read so the disagreement is visible instead of silent.
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { THEMES, THEME_PROVENANCE } from "@centripetal/universal-ui/tokens";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(HERE, "..", "src", "styles");

/* ── derivation helpers ───────────────────────────────────────────────────────
   Every value this file emits is either a kit key or a MIX of kit keys. There
   is no free-typed hex below this line, which is the whole point of the rule:
   a colour nobody can trace to tokens.js is a colour that will drift. */

/** Parse #rrggbb into channels. Throws rather than guessing — a malformed token
 *  is a broken lift, not something to paper over with a default. */
function channels(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`generate-kit-css: not a 6-digit hex token: ${hex}`);
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Linear blend, t of `b` into `a`. Used for every derived value so a hover
 *  tint or a pill wash is always a stated distance from a real token. */
function mix(a, b, t) {
  const [ar, ag, ab] = channels(a);
  const [br, bg, bb] = channels(b);
  const ch = (x, y) => Math.round(x + (y - x) * t);
  return (
    "#" +
    [ch(ar, br), ch(ag, bg), ch(ab, bb)]
      .map((v) => v.toString(16).padStart(2, "0"))
      .join("")
  );
}

/**
 * The map. Left column is the shadcn variable, right is what it is made of.
 *
 * The eight direct mappings are the ruling's own words. Everything marked
 * DERIVED is a variable shadcn needs that the kit has no key for; each states
 * the derivation in the emitted CSS so a reader can check it against tokens.js
 * without leaving the file.
 */
function block(T) {
  /* Hover surfaces. shadcn's --accent is NOT the kit's accent: in shadcn the
     "accent" pair is the hover/active background for menu rows and ghost
     buttons. The kit's accent is a brand colour and belongs on --primary. */
  const hover = mix(T.elev, T.text, 0.06);

  return [
    ["--background", T.bg, null],
    ["--foreground", T.text, null],

    ["--card", T.surface, null],
    ["--card-foreground", T.text, null],
    ["--popover", T.surface, null],
    ["--popover-foreground", T.text, "DERIVED: text, the card/popover pair share one ink"],

    ["--primary", T.accent, null],
    ["--primary-foreground", T.bg, "DERIVED: bg, for contrast on an accent fill"],

    ["--secondary", T.elev, "DERIVED: elev, the raised surface is the secondary fill"],
    ["--secondary-foreground", T.text, "DERIVED: text"],

    ["--muted", T.elev, null],
    ["--muted-foreground", T.dim, null],

    ["--accent", hover, "DERIVED: elev + 6% text — hover tint, NOT the kit accent"],
    ["--accent-foreground", T.text, "DERIVED: text"],

    ["--destructive", T.red, null],
    ["--destructive-foreground", T.bg, "DERIVED: bg, for contrast on a red fill"],

    ["--border", T.border, null],
    ["--input", T.border, null],
    ["--ring", T.accent, null],

    ["--chart-1", T.accent, "DERIVED: the kit's four track colours, in order"],
    ["--chart-2", T.statTrack, null],
    ["--chart-3", T.acctTrack, null],
    ["--chart-4", T.amber, null],
    ["--chart-5", T.red, null],

    ["--sidebar", T.surface, "DERIVED: surface, the rail sits on the card plane"],
    ["--sidebar-foreground", T.text, "DERIVED: text"],
    ["--sidebar-primary", T.accent, "DERIVED: accent"],
    ["--sidebar-primary-foreground", T.bg, "DERIVED: bg"],
    ["--sidebar-accent", hover, "DERIVED: elev + 6% text — same hover tint"],
    ["--sidebar-accent-foreground", T.text, "DERIVED: text"],
    ["--sidebar-border", T.border, "DERIVED: border"],
    ["--sidebar-ring", T.accent, "DERIVED: accent"],
  ];
}

/**
 * The LD panel set.
 *
 * The six legal panels and the five lending panels paint from an LD palette
 * that was pinned to literal light hexes by the PALETTE RULING of 2026-08-09,
 * on the reasoning that those panels "must read the same whether the shell
 * around them is running light or dark". Dave's 2026-09-01 instruction for the
 * semester face is the opposite and is newer: dark panels inside dark chrome,
 * never a white void.
 *
 * Both survive, because the older ruling is scoped by where it applies. The
 * :root defaults in index.css still carry the 2026-08-09 hexes byte-for-byte,
 * so every profile that is not wearing this face is unchanged. These
 * declarations only exist inside a [data-kit-mode] subtree.
 */
function ldBlock(T) {
  return [
    ["--ld-ground", T.surface, "DERIVED: surface — the panel body is a card plane"],
    ["--ld-ink", T.text, "DERIVED: text"],
    ["--ld-ink-muted", T.dim, "DERIVED: dim"],
    ["--ld-ink-faint", mix(T.dim, T.bg, 0.35), "DERIVED: dim + 35% bg — one step behind dim"],
    ["--ld-hairline", T.border, "DERIVED: border"],
    ["--ld-wash", T.elev, "DERIVED: elev"],
    ["--ld-accent", T.accent, "DERIVED: accent"],
  ];
}

/**
 * Pill tones. Four tones x three roles, every one of them a mix of two kit
 * keys, so a status pill inside a dark panel stops carrying its light-mode hex.
 */
function toneBlock(T) {
  const tones = [
    ["neutral", T.dim],
    ["positive", T.accent],
    ["attention", T.amber],
    ["critical", T.red],
  ];
  const out = [];
  for (const [name, base] of tones) {
    out.push([`--ld-tone-${name}-bg`, mix(T.surface, base, 0.14), `DERIVED: surface + 14% ${name} base`]);
    out.push([`--ld-tone-${name}-fg`, mix(base, T.text, 0.25), `DERIVED: ${name} base + 25% text`]);
    out.push([`--ld-tone-${name}-border`, mix(T.surface, base, 0.3), `DERIVED: surface + 30% ${name} base`]);
  }
  return out;
}

function render(mode) {
  const T = THEMES[mode];
  if (!T) throw new Error(`generate-kit-css: no theme named ${mode} in THEMES`);

  const lines = [];
  lines.push("/**");
  lines.push(" * GENERATED FILE — DO NOT EDIT.");
  lines.push(" *");
  lines.push(` * Written by scripts/generate-kit-css.mjs from @centripetal/universal-ui/tokens,`);
  lines.push(` * theme "${mode}". Edit the generator or the kit, never this file: the next`);
  lines.push(" * predev/prebuild overwrites anything typed here.");
  lines.push(" *");
  lines.push(` * SOURCE BLOCK MD5: ${THEME_PROVENANCE.block_md5}`);
  lines.push(` * lifted from ${THEME_PROVENANCE.repo} ${THEME_PROVENANCE.path}`);
  lines.push(` * lines ${THEME_PROVENANCE.hashed_lines}, blob ${THEME_PROVENANCE.blob_sha}`);
  lines.push(` * ${THEME_PROVENANCE.block_bytes} bytes, lifted ${THEME_PROVENANCE.lifted_at}`);
  lines.push(" *");
  lines.push(" * HASH DISCIPLINE: if fn_semester_theme_drift's banked md5 disagrees with the");
  lines.push(" * md5 above, THIS FILE IS THE STALE ONE BY DEFINITION. Regenerate before");
  lines.push(" * treating anything in it as evidence.");
  lines.push(" */");
  lines.push("");
  lines.push(`[data-kit-mode="${mode}"] {`);

  const emit = (rows, heading) => {
    lines.push("");
    lines.push(`  /* ${heading} */`);
    for (const [name, value, note] of rows) {
      lines.push(note ? `  ${name}: ${value}; /* ${note} */` : `  ${name}: ${value};`);
    }
  };

  emit(block(T), "shadcn surface set — the panels inside the kit's chrome");
  emit(ldBlock(T), "the LD panel palette (see the generator's note on the 2026-08-09 ruling)");
  emit(toneBlock(T), "status pill tones");

  lines.push("}");
  lines.push("");
  return lines.join("\n");
}

mkdirSync(OUT_DIR, { recursive: true });
for (const mode of Object.keys(THEMES)) {
  const file = resolve(OUT_DIR, `kit-${mode}.css`);
  writeFileSync(file, render(mode), "utf8");
  console.log(`generate-kit-css: wrote ${file} (block_md5 ${THEME_PROVENANCE.block_md5})`);
}
