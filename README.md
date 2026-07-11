# Engrove Tools

A hub for my self-developed **html / js / node / vite** tools, published via
Cloudflare Pages at **<https://tools.engroveaudio.com>**.

The landing page automatically lists every tool. Adding a new tool is just:
drop a folder into `tools/` — no edits to the index page required.

## How it works

```
tools/
  <my-tool>/
    index.html      ← the tool (required entry point)
    tool.json       ← optional metadata (name, icon, description, tags)
    ...              ← any other assets the tool needs
```

At build time, `scripts/build.mjs`:

1. scans every folder under `tools/`,
2. reads the optional `tool.json` in each (falling back to the folder name),
3. copies each folder into `dist/tools/<slug>/`,
4. copies the hub UI (`src/`) into `dist/`, and
5. writes `dist/tools.json` — the manifest the landing page fetches to render
   the cards.

The result in `dist/` is a plain static site that Cloudflare Pages serves.

## Adding a tool

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
     "tags": ["audio", "vite"],
     "entry": "index.html",
     "hidden": false
   }
   ```

   Every field is optional. Without `tool.json`, the folder name becomes the
   title and `index.html` is used as the entry point.

3. Put your tool's files in the folder. Push — Cloudflare rebuilds and the tool
   appears on the hub.

### tool.json fields

| Field         | Default              | Purpose                                             |
| ------------- | -------------------- | --------------------------------------------------- |
| `name`        | title-cased folder   | Card title                                          |
| `description` | empty                | Card subtitle                                       |
| `icon`        | 🛠️                   | Emoji shown on the card                             |
| `tags`        | `[]`                 | Filterable pills on the card                        |
| `entry`       | first `index.html`\* | File to open when the card is clicked               |
| `hidden`      | `false`              | Set `true` to keep a folder in the repo but off-hub |

\* The build looks for `index.html`, then `dist/index.html`,
`build/index.html`, `public/index.html`.

### Folder naming

- Folders starting with `_` (e.g. `_template`) or `.` are ignored by the build.
- Use lowercase, hyphenated folder names — they become the tool's URL slug:
  `tools/audio-eq/` → `https://tools.engroveaudio.com/tools/audio-eq/`.

### Tools that need a build step (vite/node)

Each folder is copied to the site **as-is**. For a Vite tool, commit its built
static output (or point `entry` at `dist/index.html`) so the folder is
self-contained. Per-tool build orchestration can be added to `scripts/build.mjs`
later if needed.

## Local development

```bash
npm install        # no runtime deps, but sets up the project
npm run build      # generates dist/
npm run dev        # builds, then serves dist/ at http://localhost:4173
```

## Deployment (Cloudflare Pages)

Connect this repo to Cloudflare Pages with:

- **Production branch:** `main`
- **Build command:** `npm run build`
- **Build output directory:** `dist`
- **Custom domain:** `tools.engroveaudio.com`

Cloudflare rebuilds on every push to `main`. `dist/` is git-ignored — it is a
build artifact, never committed.

Use at your own risk.

## License

Released into the public domain under the [Unlicense](LICENSE).
