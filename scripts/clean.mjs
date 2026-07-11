#!/usr/bin/env node
/**
 * AI-CODING NOTE:
 * Responsibility: Remove generated root deployment and determinism outputs.
 * Inputs: Known generated root paths.
 * Outputs: Clean repository build state.
 * Safe edits: Add only explicitly generated directories.
 * Do not: Remove tool source, lockfiles, manifests, or user data.
 * Verification: npm run clean && npm run build.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
for(const name of ['dist','.determinism-a','.determinism-b'])await fs.rm(path.join(root,name),{recursive:true,force:true});
console.log('Generated root output removed.');
