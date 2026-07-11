#!/usr/bin/env node
/**
 * Build script for the Engrove Tools Hub.
 *
 * Responsibilities:
 *   1. Scan the `tools/` directory. Every sub-folder is treated as a tool.
 *   2. Read the optional `tool.json` metadata file in each tool folder
 *      (falls back to sensible defaults derived from the folder name).
 *   3. Copy every tool folder into `dist/tools/<slug>/`.
 *   4. Copy the hub UI (`src/`) into `dist/`.
 *   5. Emit `dist/tools.json` — the manifest the hub page fetches at runtime.
 *
 * Adding a new tool is therefore just: drop a folder into `tools/`.
 * No dependencies — runs on a bare Node install (fast on Cloudflare Pages).
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

    const entryFile = await resolveEntry(toolPath, meta.entry);
    if (!entryFile) {
      console.warn(`  ! skipping "${slug}" — no entry file (expected index.html or tool.json "entry")`);
      continue;
    }

    const stat = await fs.stat(path.join(toolPath, entryFile));

    tools.push({
      slug,
      name: meta.name || titleFromSlug(slug),
      description: meta.description || '',
      icon: meta.icon || '🛠️',
      tags: Array.isArray(meta.tags) ? meta.tags : [],
      url: `tools/${slug}/${entryFile}`,
      updated: meta.updated || stat.mtime.toISOString().slice(0, 10),
    });

    console.log(`  + ${slug} -> ${entryFile}`);
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

  // 2. Discover tools and copy each folder into dist/tools/.
  console.log('Scanning tools/ ...');
  const tools = await collectTools();

  await fs.mkdir(DIST_TOOLS_DIR, { recursive: true });
  for (const tool of tools) {
    await copyDir(path.join(TOOLS_DIR, tool.slug), path.join(DIST_TOOLS_DIR, tool.slug));
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
