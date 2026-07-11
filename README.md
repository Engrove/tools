# Engrove Tools

Engrove Tools is a deterministic static hub for browser-based engineering and audio utilities, published through Cloudflare Pages at <https://tools.engroveaudio.com>.

## AI governance

AI coding agents must read `AGENTS.md`, `EIC.md`, and `AI_CODING_DOCTRINE.md` before changing the repository. Public SEO, route, claim, privacy, and AI-discovery state is owned only by `config/site.json` and validated `tools/*/tool.json` manifests.

## Source model

```text
config/site.json              global public identity and policy
schema/site.schema.json       strict site schema
schema/tool.schema.json       strict per-tool schema
tools/<slug>/tool.json        required public metadata
scripts/lib/registry.mjs      immutable normalized registry
scripts/build.mjs             deterministic build orchestrator
src/index.html                generated hub template
functions/_middleware.ts      preview noindex and Markdown negotiation
dist/                         disposable generated deployment output
```

A public tool manifest must be complete. The build fails on missing fields, unknown properties, invalid routes, stale inferred dates, unresolved related tools, unsafe paths, unsupported claims, or parity differences.

## Public routing

Canonical tool routes are always:

```text
/tools/<slug>/
```

The canonical route is a statically generated semantic landing page. The interactive application is placed below `/tools/<slug>/app/`. Source entry filenames and build directories are never canonical URLs.

## Build

Requirements: Node.js `>=22.12.0`, npm `>=10`.

```bash
npm run clean
npm run build
npm run check:seo
npm run check:determinism
npm run check:sanitation
```

The build:

1. validates site and tool manifests;
2. creates one normalized immutable registry;
3. builds each buildable tool with a reproducible lockfile;
4. copies only allowed runtime assets;
5. generates static hub and per-tool landing HTML;
6. generates canonical metadata, JSON-LD, sitemaps, robots, AI discovery resources, and headers;
7. rejects unsupported claims, route drift, missing parity, and files above Cloudflare Pages' 25 MiB limit;
8. writes `dist/` only after pre-write validation and runs post-write checks.

`dist/` and per-tool build output are generated and must not be committed.

## Generated discovery surfaces

The build generates:

- `robots.txt`, `sitemap.xml`, `sitemap.json`, `sitemap.txt`;
- `llms.txt`, `llms-full.txt`, `for-agents.md`, `for-agents/index.html`;
- `ai.json`, `agent-capabilities.json`, `public-info.json`;
- `.well-known/engrove-tools.json` and agent-skill manifests;
- per-tool `tool.ai.json` and `tool.md`;
- static HTML and JSON-LD for the hub and every public tool.

These files are generated from the registry and must never be hand-edited.

## Cloudflare Pages

- Production branch: `main`
- Build command: `npm run build`
- Output directory: `dist`
- Canonical domain: `tools.engroveaudio.com`

Preview hosts ending in `.pages.dev` receive `X-Robots-Tag: noindex, nofollow`. A successful source commit is not proof of a successful production deployment; production verification must be performed against the custom domain.

## License

Released into the public domain under the Unlicense.
