#!/usr/bin/env node
/**
 * AI-CODING NOTE:
 * Responsibility: Produce the static runtime bundle and vendor the exact Three.js revision required by TD053F.
 * Inputs: Runtime source files and reviewed local Three.js 0.128.0 vendor sources in the tool root.
 * Outputs: Disposable dist/ directory consumed by the repository build.
 * Safe edits: Explicit runtime allowlist and deterministic file copies.
 * Do not: Copy acceptance tests, reports, patches, node_modules, or unpinned remote assets into dist.
 * Verification: npm test and repository-root npm run check:sanitation.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'dist');
const runtimeEntries = [
  'index.html',
  'help.html',
  'LICENSE',
  'THIRD_PARTY_LICENSES.md',
  'css',
  'data',
  'js',
  'vendor',
  'tonearm_designer_ai_freeform_loft.schema.json',
  'tonearm_designer_ai_response_apply_runtime_sculpt.schema.json',
  'td047_flat_headshell_sculpt_example_ai_vibe.json',
  'td048_flat_stiff_front_sculpt_example_ai_vibe.json'
];

async function copyEntry(relativePath) {
  const source = path.join(root, relativePath);
  const target = path.join(output, relativePath);
  const stat = await fs.stat(source);
  await fs.mkdir(path.dirname(target), { recursive: true });
  if (stat.isDirectory()) await fs.cp(source, target, { recursive: true });
  else await fs.copyFile(source, target);
}

await fs.rm(output, { recursive: true, force: true });
await fs.mkdir(output, { recursive: true });
for (const entry of runtimeEntries) await copyEntry(entry);

console.log('Tonearm Profile Designer build complete.');
