#!/usr/bin/env node
/**
 * Build script for the Engrove Tools Hub.
 *
 * Responsibilities:
 *   1. Scan the `tools/` directory. Every sub-folder is treated as a tool.
 *   2. Read the optional `tool.json` metadata file in each tool folder
 *      (falls back to sensible defaults derived from the folder name).
 *   3. For tools that carry a `package.json` with a `build` script (Vite/Node
 *      tools), run `npm ci`/`npm install` + `npm run build` in that folder and
 *      copy only its build output (default `dist/`, override via tool.json
 *      `buildOutputDir`) into the site. This keeps generated artifacts and
 *      `node_modules` out of git — the tool's own source is what's committed.
 *      Tools without a build script are copied into the site as-is (plain
 *      static html/js).
 *   4. Copy the hub UI (`src/`) into `dist/`.
 *   5. Emit `dist/tools.json` — the manifest the hub page fetches at runtime.
 *
 * Adding a new static tool is therefore just: drop a folder into `tools/`.
 * Adding a buildable tool: drop a folder with its own package.json + "build"
 * script that emits static output. No dependencies of our own — runs on a
 * bare Node install (fast on Cloudflare Pages); each buildable tool manages
 * its own devDependencies via its own package.json.
 */

import { promises as fs } from 'node:fs';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const TOOLS_DIR = path.join(ROOT, 'tools');
const SRC_DIR = path.join(ROOT, 'src');
const DIST_DIR = path.join(ROOT, 'dist');
const DIST_TOOLS_DIR = path.join(DIST_DIR, 'tools');

/** Turn a folder name into a human-readable title: "audio-eq" -> "Audio Eq". */
function titleFromSlug(slug) {
  return slug
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/** Recursively copy a directory (Node 18+ has fs.cp, but we keep it explicit). */
async function copyDir(from, to) {
  await fs.cp(from, to, { recursive: true });
}

/** Pick the entry file for a tool: explicit `entry`, else first candidate found. */
async function resolveEntry(toolPath, declaredEntry) {
  const candidates = declaredEntry
    ? [declaredEntry]
    : ['index.html', 'dist/index.html', 'build/index.html', 'public/index.html'];
  for (const candidate of candidates) {
    if (await exists(path.join(toolPath, candidate))) return candidate;
  }
  return null;
}

async function readMetadata(toolPath) {
  const metaPath = path.join(toolPath, 'tool.json');
  if (!(await exists(metaPath))) return {};
  try {
    return JSON.parse(await fs.readFile(metaPath, 'utf8'));
  } catch (err) {
    console.warn(`  ! Could not parse ${path.relative(ROOT, metaPath)}: ${err.message}`);
    return {};
  }
}

/** True if the tool folder has its own package.json with a "build" script. */
async function isBuildableTool(toolPath) {
  const pkgPath = path.join(toolPath, 'package.json');
  if (!(await exists(pkgPath))) return false;
  try {
    const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf8'));
    return typeof pkg.scripts?.build === 'string';
  } catch {
    return false;
  }
}

/** Runs `npm ci`/`npm install` + `npm run build` inside a tool's own folder. */
function runToolBuild(toolPath, slug) {
  const hasLockfile = existsSync(path.join(toolPath, 'package-lock.json'));
  const installCmd = hasLockfile ? ['ci'] : ['install'];
  for (const args of [installCmd, ['run', 'build']]) {
    console.log(`  $ npm ${args.join(' ')}  (tools/${slug})`);
    const res = spawnSync('npm', args, { cwd: toolPath, stdio: 'inherit' });
    if (res.status !== 0) {
      throw new Error(`tools/${slug}: "npm ${args.join(' ')}" failed (exit ${res.status})`);
    }
  }
}

async function collectTools() {
  if (!(await exists(TOOLS_DIR))) return [];

  const entries = await fs.readdir(TOOLS_DIR, { withFileTypes: true });
  const tools = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const slug = entry.name;
    // Skip dotfolders and template/example scaffolding starting with "_".
    if (slug.startsWith('.') || slug.startsWith('_')) continue;

    const toolPath = path.join(TOOLS_DIR, slug);
    const meta = await readMetadata(toolPath);

    if (meta.hidden === true) {
      console.log(`  - skipping "${slug}" (hidden)`);
      continue;
    }

    const buildable = await isBuildableTool(toolPath);
    if (buildable) {
      runToolBuild(toolPath, slug);
    }

    // Buildable tools ship only their build output; static tools ship as-is.
    const outputDir = buildable ? path.join(toolPath, meta.buildOutputDir || 'dist') : toolPath;
    if (buildable && !(await exists(outputDir))) {
      throw new Error(`tools/${slug}: build succeeded but output dir "${path.relative(toolPath, outputDir)}" is missing`);
    }

    const entryFile = await resolveEntry(outputDir, meta.entry);
    if (!entryFile) {
      console.warn(`  ! skipping "${slug}" — no entry file (expected index.html or tool.json "entry")`);
      continue;
    }

    const stat = await fs.stat(path.join(outputDir, entryFile));

    tools.push({
      slug,
      name: meta.name || titleFromSlug(slug),
      description: meta.description || '',
      icon: meta.icon || '🛠️',
      tags: Array.isArray(meta.tags) ? meta.tags : [],
      url: `tools/${slug}/${entryFile}`,
      updated: meta.updated || stat.mtime.toISOString().slice(0, 10),
      copyFrom: outputDir,
    });

    console.log(`  + ${slug} -> ${entryFile}${buildable ? ' (built)' : ''}`);
  }

  // Newest first, then alphabetical as a stable tiebreaker.
  tools.sort((a, b) => (b.updated || '').localeCompare(a.updated || '') || a.name.localeCompare(b.name));
  return tools;
}

async function main() {
  console.log('Building Engrove Tools Hub...');

  await fs.rm(DIST_DIR, { recursive: true, force: true });
  await fs.mkdir(DIST_DIR, { recursive: true });

  // 1. Copy the hub UI.
  if (await exists(SRC_DIR)) {
    await copyDir(SRC_DIR, DIST_DIR);
  }

  // 2. Discover tools, building any that need it, and copy each into dist/tools/.
  console.log('Scanning tools/ ...');
  const tools = await collectTools();

  await fs.mkdir(DIST_TOOLS_DIR, { recursive: true });
  for (const tool of tools) {
    await copyDir(tool.copyFrom, path.join(DIST_TOOLS_DIR, tool.slug));
    delete tool.copyFrom; // internal-only, not part of the public manifest
  }

  // 3. Emit the manifest.
  const manifest = {
    generatedAt: new Date().toISOString(),
    count: tools.length,
    tools,
  };
  await fs.writeFile(path.join(DIST_DIR, 'tools.json'), JSON.stringify(manifest, null, 2));

  console.log(`\nDone. ${tools.length} tool(s) indexed into dist/.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
