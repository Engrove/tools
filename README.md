# Engrove Tools

Static Cloudflare Pages hub for browser-based engineering and audio tools:
**<https://tools.engroveaudio.com>**.

The repository uses one validated metadata registry to generate the public hub,
canonical tool routes, structured data, sitemaps, robots policy and AI discovery
corpus. Generated output is disposable and must never be edited or committed.

## AI coding contracts

AI coding systems must read, in this order:

1. [`EIC.md`](EIC.md)
2. [`AGENTS.md`](AGENTS.md)
3. [`AI_CODING_DOCTRINE.md`](AI_CODING_DOCTRINE.md)
4. the nearest path-scoped `AGENTS.md`

Claude Code, Gemini and GitHub Copilot bootstrap files point to the same canonical
contract. They are not independent policy sources.

## Repository layout

```text
config/site.json                 site-global canonical metadata
schema/site.schema.json          site source contract
schema/tool.schema.json          strict public tool contract
src/                             hub UI assets copied to dist
public/_headers                  Cloudflare static response policy
functions/_middleware.ts         pages.dev noindex + Markdown negotiation
scripts/build.mjs                application discovery/build/copy + asset limit gate
scripts/compile-seo.mjs          deterministic semantic compiler entrypoint
scripts/lib/seo-compiler.mjs     normalized registry and all SEO/AI generators
scripts/check-seo.mjs            generated-surface parity checks
scripts/check-determinism.mjs    two-build byte comparison
tools/<slug>/tool.json           required source metadata for every real tool
dist/                            generated deployment output; never commit
```

## Canonical source model

`config/site.json` owns only site-global identity and policy.

Every non-template tool directory must contain a schema-versioned `tool.json`.
Required metadata is fail-closed: the build does not infer names, descriptions,
dates, routes, claims, limitations, privacy status or evidence from source code,
package files, filenames or filesystem timestamps.

Core invariants:

- `slug` equals the directory name;
- `canonicalPath` equals `/tools/<slug>/`;
- `updated` is an explicit ISO date owned by source metadata;
- `public=true` requires `hidden=false`;
- unknown metadata properties fail validation;
- related tool identifiers must resolve;
- evidence URLs must use HTTPS;
- generated FAQ structured data is emitted only with the same visible FAQ;
- positive, negative and prohibited claim boundaries remain explicit.

Use `tools/cobra-wand/tool.json` as the current complete example.

## Build pipeline

```bash
npm run clean
npm run build
npm run check:seo
```

`npm run build` executes two stages:

1. `build:apps`
   - scans non-template tool directories;
   - installs and builds tools with `package.json.scripts.build`;
   - copies static tools as-is;
   - copies only configured output for buildable tools;
   - preserves `PUPPETEER_SKIP_DOWNLOAD=true`;
   - rejects generated files above Cloudflare Pages' 25 MiB per-file limit.
2. `build:seo`
   - loads and validates site/tool metadata;
   - creates an immutable normalized registry;
   - emits the complete static hub inventory;
   - creates stable `/tools/<slug>/` landing pages;
   - preserves each interactive application as same-origin `app.html` beneath its
     semantic landing page;
   - emits canonical, Open Graph, Twitter and JSON-LD metadata;
   - emits sitemap, robots and AI/agent discovery resources;
   - copies `_headers` into the deployment artifact;
   - checks generated tool-directory parity.

The final public route never exposes a source entry filename such as
`dist/index.html`.

## Generated public discovery surfaces

The build emits:

```text
/index.html
/tools.json
/tools/<slug>/index.html
/tools/<slug>/app.html
/tools/<slug>/tool.ai.json
/tools/<slug>/tool.md
/robots.txt
/sitemap.xml
/sitemap.json
/sitemap.txt
/llms.txt
/llms-full.txt
/for-agents.md
/for-agents/index.html
/ai.json
/agent-capabilities.json
/public-info.json
/.well-known/engrove-tools.json
/.well-known/agent-skills/index.json
/.well-known/agent-skills/engrove-tools/SKILL.md
```

`tools.json` is a runtime convenience artifact, not a source of truth.
No wall-clock generation timestamp is placed in indexable semantic files.

## SEO and AI SEO guarantees

The root HTML contains the complete public tool inventory before JavaScript
executes. JavaScript only enhances the existing static inventory.

Generated structured data uses:

- `Organization`
- `WebSite`
- `CollectionPage`
- `ItemList`
- `WebPage`
- `WebApplication`
- `BreadcrumbList`
- `FAQPage` only when visible FAQ exists

The compiler does not emit reviews, ratings, endorsements, certification claims
or API claims unsupported by implementation evidence.

Published capability boundaries explicitly state that the site provides static
public data resources but no public backend API, server MCP endpoint, OAuth,
user accounts or commerce system.

## Preview and content-negotiation policy

Cloudflare Pages preview hosts ending in `.pages.dev` receive:

```text
X-Robots-Tag: noindex, nofollow
```

Requests for `/for-agents/` with `Accept: text/markdown` receive the generated
Markdown representation and `Vary: Accept`.

The custom production domain remains the only canonical origin.

## Validation

```bash
npm run check:seo
npm run check:determinism
npm run check:sanitation
```

`check:seo` parses generated JSON and validates exact public-tool parity across
runtime registry, sitemap, agent capability data, AI corpus and generated routes.
It also verifies canonical links, visible summaries, JSON-LD and robots policy.

`check:determinism` runs the same source build twice and compares every generated
file by path, byte length and SHA-256, excluding only `build-info.json` if such a
non-indexable diagnostic file is later introduced.

Tool-specific type checks, geometry gates, export validation and browser smoke
tests remain mandatory under the repository and tool-local AI contracts.

## Cloudflare Pages configuration

- Production branch: `main`
- Build command: `npm run build`
- Build output directory: `dist`
- Canonical domain: `tools.engroveaudio.com`

A GitHub commit is not evidence of a successful deployment. A source-level build
is not evidence of working browser routing, external WASM loading, persistence or
exports. Deployment-sensitive changes require preview and production smoke tests.

## Runtime requirements

- Node.js `>=22.12.0`
- npm `>=10`

## License

Released into the public domain under the [Unlicense](LICENSE).
