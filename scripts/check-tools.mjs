#!/usr/bin/env node
/**
 * AI-CODING NOTE:
 * Responsibility: Run the root blocking test gate for every public tool with a declared npm test command.
 * Inputs: The canonical normalized registry and public tool package manifests.
 * Outputs: Preserved tool test output, a stable JSON summary, and a failing process exit when any tool cannot pass.
 * Safe edits: CLI orchestration and deterministic reporting only.
 * Do not: Hardcode tool slugs, infer public tools outside the registry, or downgrade process failures.
 * Verification: node --test test/tool-test-runner.test.mjs && npm run check:tools && npm run check:sanitation.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRegistry } from './lib/registry.mjs';
import { runPublicToolTests } from './lib/tool-test-runner.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

try {
  const registry = await loadRegistry(root);
  const summary = await runPublicToolTests(registry.publicTools);
  console.log(JSON.stringify(summary, null, 2));
  if (summary.status !== 'PASS') process.exitCode = 1;
} catch (error) {
  console.error(JSON.stringify({
    status: 'FAIL',
    publicTools: null,
    testableTools: null,
    passed: 0,
    failed: 1,
    notApplicable: null,
    tools: [],
    error: error?.stack ?? String(error)
  }, null, 2));
  process.exitCode = 1;
}
