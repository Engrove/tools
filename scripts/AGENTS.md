# Build and SEO compiler AI contract

This file overrides repository-root build descriptions where they conflict for `scripts/**`.

- `scripts/build.mjs` builds application artifacts only.
- `scripts/compile-seo.mjs` invokes the canonical normalized registry compiler after application build.
- `scripts/lib/seo-compiler.mjs` is the sole owner of public SEO, JSON-LD, sitemap, robots and AI discovery generation.
- Do not create independent route lists or metadata generators.
- All generated semantic output must be deterministic from committed source metadata.
- Required metadata failures are fatal. Do not add fallback names, descriptions, dates, claims or canonical paths.
- Never use filesystem mtime as public freshness data.
- Generated output is disposable and never edited directly.
- Preserve the Cloudflare 25 MiB asset gate and externalized OpenCascade WASM contract.
- Changes require `npm run clean && npm run build && npm run check:seo`.
- Compiler changes additionally require `npm run check:determinism` and representative browser/preview smoke testing.
