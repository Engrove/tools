#!/usr/bin/env node
/**
 * AI-CODING NOTE:
 * Responsibility: invoke the deterministic SEO/AI registry compiler after the static application build.
 * Inputs: repository source tree and generated dist directory.
 * Outputs: validated semantic discovery surfaces in dist.
 * Safe edits: invocation parameters and explicit error reporting.
 * Do not: duplicate registry logic or generate independent route lists.
 * Verification: npm run build && npm run check:seo.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileSeo } from './lib/seo-compiler.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

compileSeo({ root, dist: path.join(root, 'dist') })
  .then(registry => console.log(`SEO compiler: ${registry.publicTools.length} public tool(s), deterministic surfaces emitted.`))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
