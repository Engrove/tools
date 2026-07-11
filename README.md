# Engrove Tools

Engrove Tools is a deterministic static hub for browser-based engineering and audio utilities, published through Cloudflare Pages at <https://tools.engroveaudio.com>.

## AI governance

All AI coding agents, regardless of model, vendor, IDE, connector, task type, or change size, must read `AI_VIBE_CODING_RULES.md`, `AGENTS.md`, `EIC.md`, and `AI_CODING_DOCTRINE.md` before analyzing or changing the repository. Tool-specific bootstrap files and the repository skill under `.agents/skills/ai-vibe-coding/` point to the same canonical policy and may not weaken it.

Correctness, code quality, contract preservation, safety, and verification take priority over speed, response latency, token use, and token optimization. `npm run check` blocks missing or disconnected governance files.

Public SEO, route, claim, privacy, analytics, and AI-discovery state is owned only by `config/site.json` and validated `tools/*/tool.json` manifests.

## Source model

```text
AI_VIBE_CODING_RULES.md     canonical AI Vibe coding policy
AGENTS.md                   repository-specific execution contract
.agents/skills/             repository AI skill bootstrap
config/site.json            global public identity, policy and analytics IDs
schema/site.schema.json     strict site schema
schema/tool.schema.json     strict per-tool schema
tools/<slug>/tool.json      required public metadata
scripts/lib/registry.mjs    immutable normalized registry
scripts/lib/render.mjs      deterministic HTML, discovery and analytics renderer
scripts/build.mjs           deterministic build orchestrator
functions/_middleware.ts    preview noindex and Markdown negotiation
dist/                       disposable generated deployment output
```

A public tool manifest must be complete. The build fails on missing fields, unknown properties, invalid routes, stale inferred dates, unresolved related tools, unsafe paths, unsupported claims, analytics drift, or parity differences.

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
npm run check
npm run build
npm run check:seo
npm run check:determinism
npm run check:sanitation
```

The build:

1. validates mandatory AI governance and source contracts;
2. validates site and tool manifests;
3. creates one normalized immutable registry;
4. builds each buildable tool with a reproducible lockfile;
5. copies only allowed runtime assets;
6. generates static hub and per-tool landing HTML;
7. generates canonical metadata, JSON-LD, sitemaps, robots, AI discovery resources, analytics bootstrap, and headers;
8. rejects unsupported claims, route drift, missing parity, analytics configuration drift, and files above Cloudflare Pages' 25 MiB limit;
9. writes `dist/` only after pre-write validation and runs post-write checks.

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

## Analytics

Production analytics configuration is source-owned in `config/site.json`:

- Google Analytics 4: `G-GFWZVJD0KJ`
- Microsoft Clarity: `xkp2rvqux5`
- permitted hostname: `tools.engroveaudio.com`

The build generates `/analytics.js` and references it from the hub, semantic tool pages, agent HTML page, and interactive application entry pages. The loader exits before contacting either provider unless `window.location.hostname` exactly equals `tools.engroveaudio.com`; local development and Cloudflare preview hosts therefore do not generate analytics traffic.

Analytics sends browser usage data to Google and Microsoft. Changes to provider IDs, host policy, loaded pages, CSP origins, or data-collection behavior require explicit approval and corresponding schema, renderer, verification, and documentation updates.

## Cloudflare Pages

- Production branch: `main`
- Build command: `npm run build`
- Output directory: `dist`
- Canonical domain: `tools.engroveaudio.com`

Preview hosts ending in `.pages.dev` receive `X-Robots-Tag: noindex, nofollow`. A successful source commit is not proof of a successful production deployment; production verification must be performed against the custom domain.

## License

Released into the public domain under the Unlicense.
