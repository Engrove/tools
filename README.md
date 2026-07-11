# Engrove Tools

A static hub for self-developed **HTML / JavaScript / TypeScript / Node / Vite** tools, published through Cloudflare Pages at **<https://tools.engroveaudio.com>**.

The landing page is generated automatically from the folders under `tools/`. Do not register tools manually in the hub UI.

## AI coding agents

Repository-wide machine instructions are defined in [`AGENTS.md`](AGENTS.md). AI coding systems must read it before analysis, editing, testing, committing, or reporting.

Compatibility bootstrap files are provided for Claude Code, Gemini, and GitHub Copilot. They point to `AGENTS.md`; they are not independent policy sources.

## Repository layout

```text
src/                         hub UI
scripts/build.mjs            tool discovery, per-tool builds, manifest generation, deployment gates
tools/
  _template/                 ignored scaffold
  <tool-slug>/
    index.html               static entry or source entry
    tool.json                optional hub metadata
    package.json             optional; scripts.build makes the tool buildable
    ...                      tool source and assets
dist/                        generated Cloudflare Pages output; never commit
```

## Build behavior

At build time, `scripts/build.mjs`:

1. removes and recreates the root `dist/`,
2. copies the hub UI from `src/`,
3. scans every non-hidden directory under `tools/`,
4. reads optional `tool.json` metadata,
5. identifies tools with a `package.json` `build` script,
6. installs and builds each buildable tool,
7. copies only that tool's configured build output, defaulting to its `dist/`,
8. copies static tools as-is,
9. writes `dist/tools.json`, and
10. rejects any generated file larger than Cloudflare Pages' 25 MiB per-file limit.

Buildable tools with a lockfile use `npm ci --no-audit --no-fund`. Puppeteer's browser download is disabled during the production build because browser binaries are not part of the static deployment.

## Adding a static tool

1. Copy the scaffold:

   ```bash
   cp -r tools/_template tools/my-new-tool
   ```

2. Edit `tools/my-new-tool/tool.json`:

   ```json
   {
     "name": "My New Tool",
     "description": "What it does, in one line.",
     "icon": "🎛️",
     "tags": ["audio", "static"],
     "entry": "index.html",
     "hidden": false
   }
   ```

3. Add a self-contained `index.html` and any local assets.
4. Run the root build before publishing.

## Adding a buildable tool

A tool is buildable when its own `package.json` contains `scripts.build`.

Requirements:

- commit the source and a reproducible lockfile;
- produce static output in `dist/`, or declare another directory with `tool.json.buildOutputDir`;
- use relative asset paths because the tool is hosted below `/tools/<slug>/`;
- for Vite, normally set `base: "./"`;
- do not commit generated `dist/`, `node_modules/`, browser binaries, or oversized WASM/media assets;
- ensure every generated file is at most 25 MiB;
- externally hosted runtime assets must be immutable, version-pinned, CORS-compatible, and browser-tested.

Example `tool.json`:

```json
{
  "name": "My Vite Tool",
  "description": "A compiled browser tool.",
  "icon": "🛠️",
  "tags": ["vite", "typescript"],
  "buildOutputDir": "dist",
  "entry": "index.html",
  "hidden": false
}
```

## `tool.json` fields

| Field | Default | Purpose |
|---|---|---|
| `name` | title-cased folder | Hub card title |
| `description` | empty | Hub card subtitle |
| `icon` | 🛠️ | Card icon |
| `tags` | `[]` | Filterable tags |
| `entry` | first supported `index.html` | Entry relative to the copied output directory |
| `hidden` | `false` | Keep the folder in the repository but exclude it from the hub |
| `buildOutputDir` | `dist` for buildable tools | Directory copied after the tool build |

Entry candidates are checked in this order when `entry` is not specified: `index.html`, `dist/index.html`, `build/index.html`, `public/index.html`.

Folders beginning with `_` or `.` are ignored. Use lowercase hyphenated slugs:

```text
tools/audio-eq/ -> https://tools.engroveaudio.com/tools/audio-eq/
```

## Local development and validation

Requirements:

- Node.js `>=22.12.0`
- npm `>=10`

From the repository root:

```bash
npm run clean
npm run build
npm run dev
```

`npm run build` is mandatory before every push to `main`, including documentation-only changes, because Cloudflare rebuilds the complete repository state on every push.

Tool-specific type checks, tests, full geometry gates, and browser smoke tests are defined in `AGENTS.md` and the tool's own documentation.

## Deployment

Cloudflare Pages configuration:

- **Production branch:** `main`
- **Build command:** `npm run build`
- **Build output directory:** `dist`
- **Custom domain:** `tools.engroveaudio.com`

A successful GitHub commit does not prove that Cloudflare deployed successfully. A successful build does not prove that runtime assets, WASM initialization, routing, persistence, or exports work in the browser. Deployment-sensitive changes require verification of the actual Pages deployment and production URL.

`dist/` is generated, git-ignored, and must never be committed.

Use at your own risk.

## License

Released into the public domain under the [Unlicense](LICENSE).
