#!/usr/bin/env node
/**
 * AI-CODING NOTE:
 * Responsibility: Produce the static Trace to Plug runtime bundle, including the geometry kernel and contract schemas it consumes.
 * Inputs: This tool's own runtime files, the Tonearm Profile Designer geometry kernel, and the repository trace-project-package schemas.
 * Outputs: A disposable dist/ directory consumed by the repository build.
 * Safe edits: The explicit file lists below and deterministic copies.
 * Do not: Edit a kernel module while copying it, or fork one into this tool; Tonearm Profile Designer owns them.
 * Verification: npm test and repository-root npm run check:sanitation.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'dist');
const repositoryRoot = path.resolve(root, '..', '..');
const donor = path.join(repositoryRoot, 'tools', 'tonearm-profile-designer');

const ownEntries = ['index.html', 'README.md', 'css', 'js'];

// The geometry kernel is owned, tested and released by Tonearm Profile Designer. It is copied verbatim
// rather than forked so a correctness fix there cannot silently diverge from what this tool ships. Load
// order matters: semantics before validator, and the loft kernel after the modules it composes.
const KERNEL_MODULES = Object.freeze([
    'math.js',
    'freeform-centerline.js',
    'freeform-rings.js',
    'freeform-features.js',
    'freeform-schema.js',
    'freeform-loft-kernel.js',
    'freeform-analysis-adapter.js',
    'freeform-section-properties.js',
    'freeform-resonance-analysis.js',
    'freeform-geometry-audit.js',
    'freeform-physical-analysis.js',
    'freeform-plug-mould-audit.js',
    'freeform-pattern-split.js',
    'manual-trace-3d-adapter.js',
    'trace-project-package-reader.js',
    'trace-project-package-semantics.js',
    'trace-project-package-validator.js',
    'trace-project-package-adapter.js'
]);
const VENDOR_FILES = Object.freeze(['three.min.js', 'OrbitControls.js']);
const CONTRACT_SCHEMAS = Object.freeze(['manifest.schema.json', 'project.schema.json', 'trace.schema.json']);

async function copyEntry(relativePath) {
    const source = path.join(root, relativePath);
    const target = path.join(output, relativePath);
    const stat = await fs.stat(source);
    await fs.mkdir(path.dirname(target), { recursive: true });
    if (stat.isDirectory()) await fs.cp(source, target, { recursive: true });
    else await fs.copyFile(source, target);
}

async function copyList(files, from, to) {
    await fs.mkdir(to, { recursive: true });
    for (const name of files) await fs.copyFile(path.join(from, name), path.join(to, name));
}

await fs.rm(output, { recursive: true, force: true });
await fs.mkdir(output, { recursive: true });
for (const entry of ownEntries) await copyEntry(entry);
await copyList(KERNEL_MODULES, path.join(donor, 'js'), path.join(output, 'js', 'kernel'));
await copyList(VENDOR_FILES, path.join(donor, 'vendor'), path.join(output, 'vendor'));
// Package validation is fail-closed and the deployed hub serves this tool from its own /app/ route, so
// the schemas are published beside the runtime rather than referenced by a repository path.
await copyList(CONTRACT_SCHEMAS, path.join(repositoryRoot, 'schema', 'trace-project-package'), path.join(output, 'schema', 'trace-project-package'));

export { KERNEL_MODULES, VENDOR_FILES, CONTRACT_SCHEMAS };
console.log('Trace to Plug build complete.');
