/**
 * D-NOINDEX-1 — unlaunched client-facing surfaces built from this repo are
 * indexable: the SPA catch-all rewrite (vercel.json) answers /robots.txt with
 * index.html (200, text/html) instead of directives, so a crawler asking what
 * is disallowed gets a page and no answer. That is worse than a 404.
 *
 * Build-time plugin, not runtime: it emits a REAL dist/robots.txt (a static
 * file the rewrite cannot intercept) and injects a `<meta name="robots">` tag
 * into the built index.html — gated on ONE env flag.
 *
 * VITE_PUBLIC_LAUNCH — the flag. THE DEFAULT WHEN IT IS ABSENT IS THE SAFE
 * STATE: noindex + disallow-all. A missing variable must never silently
 * publish a client surface. Set VITE_PUBLIC_LAUNCH=true in the hosting
 * project's env, only once that surface is meant to be found, to flip it to
 * a permissive robots.txt with no noindex meta. Documented in .env.example
 * and README.md.
 *
 * Applies to the vite.config.ts build only (lending-app + lawdog-app, the two
 * profiles that share index.html). It does NOT reach sites/lending — that is
 * a separate build (vite.lending.config.ts, its own publicDir) for the public
 * marketing site, which already ships its own deliberately-permissive
 * public/robots.txt (Allow: /) and is out of scope by design, not by miss.
 */

import type { Plugin } from "vite";

const NOINDEX_META = '<meta name="robots" content="noindex, nofollow" />';

function isLaunched(): boolean {
  return process.env.VITE_PUBLIC_LAUNCH === "true";
}

export function publicSurfaceGatePlugin(): Plugin {
  const launched = isLaunched();

  return {
    name: "public-surface-gate",
    apply: "build",
    transformIndexHtml(html) {
      if (launched) return html;
      return html.replace("</head>", `    ${NOINDEX_META}\n  </head>`);
    },
    generateBundle() {
      const body = launched
        ? "User-agent: *\nAllow: /\n"
        : "User-agent: *\nDisallow: /\n";
      this.emitFile({ type: "asset", fileName: "robots.txt", source: body });
    },
  };
}
