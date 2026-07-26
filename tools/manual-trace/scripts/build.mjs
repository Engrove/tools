#!/usr/bin/env node
/**
 * AI-CODING NOTE:
 * Responsibility: Produce the static Manual Trace runtime bundle and publish the merged trace-project-package contract schemas beside it.
 * Inputs: Runtime source files and the repository contract schemas.
 * Outputs: Disposable dist/ directory consumed by the repository build.
 * Safe edits: Explicit runtime allowlist and deterministic file copies.
 * Do not: Copy tests or fixtures into dist, or edit a schema while copying it.
 * Verification: node --test test/trace-project-package/*.test.mjs and repository-root npm run check:sanitation.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'dist');
const runtimeEntries = [
  'index.html',
  'styles.css',
  'README.md',
  'app-00.js',
  'app-01.js',
  'app-02.js',
  'app-03.js',
  'app-04.js',
  'app-05.js',
  'app-06.js',
  'app-07.js',
  'app-08.js',
  'app-09.js',
  'trace-project-package.js',
  'trace-project-package-production.js'
];

// The browser exporter validates against the merged v1 contract before it will emit a package.
// schema/trace-project-package/ in the repository root stays the single source of truth; it is
// published verbatim beside the tool runtime because the deployed hub serves each tool from its
// own /tools/<slug>/app/ route and does not expose repository paths.
const contractSchemaDir = path.resolve(root, '..', '..', 'schema', 'trace-project-package');
const contractSchemas = ['manifest.schema.json', 'project.schema.json', 'trace.schema.json'];

async function copyEntry(relativePath) {
  const source = path.join(root, relativePath);
  const target = path.join(output, relativePath);
  const stat = await fs.stat(source);
  await fs.mkdir(path.dirname(target), { recursive: true });
  if (stat.isDirectory()) await fs.cp(source, target, { recursive: true });
  else await fs.copyFile(source, target);
}

async function copyContractSchemas() {
  const target = path.join(output, 'schema', 'trace-project-package');
  await fs.mkdir(target, { recursive: true });
  for (const name of contractSchemas) {
    const content = await fs.readFile(path.join(contractSchemaDir, name), 'utf8');
    JSON.parse(content);
    await fs.writeFile(path.join(target, name), content);
  }
}

await fs.rm(output, { recursive: true, force: true });
await fs.mkdir(output, { recursive: true });
for (const entry of runtimeEntries) await copyEntry(entry);
await copyContractSchemas();

console.log('Manual Trace build complete.');
