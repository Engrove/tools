#!/usr/bin/env node
/**
 * AI-CODING NOTE:
 * Responsibility: Run self-contained port regressions and all portable upstream TD053F acceptance harnesses.
 * Inputs: Tool source, port tests, and upstream acceptance scripts.
 * Outputs: Process status plus a scoped machine-readable summary.
 * Safe edits: Explicit skip classification for objectively unavailable upstream fixtures or environments.
 * Do not: Turn a failed portable test into a skip or claim browser verification.
 * Verification: npm test.
 */
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const unavailable = new Set([
  'fas18_ai_vibe_3d_manufacturing_acceptance.js',
  'td051b_schema_reference_cleanup_acceptance.js',
  'td052_freeform_schema_acceptance.js'
]);
const tests = [
  path.join('test', 'manual-trace-adapter.test.cjs'),
  path.join('test', 'manual-trace-freeform-integration.test.cjs'),
  path.join('test', 'empty-session-contract.test.cjs'),
  path.join('test', 'observation-package-contract.test.cjs'),
  ...readdirSync(path.join(root, 'tools'))
    .filter(name => name.endsWith('.js') && !unavailable.has(name))
    .sort()
    .map(name => path.join('tools', name))
];

const failed = [];
for (const relative of tests) {
  const result = spawnSync(process.execPath, [relative], { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) {
    failed.push({ test: relative, status: result.status, stdout: result.stdout, stderr: result.stderr });
  }
}

const summary = {
  status: failed.length ? 'FAIL' : 'PASS_WITH_SCOPE',
  executed: tests.length,
  passed: tests.length - failed.length,
  failed: failed.length,
  executedTests: tests,
  unavailable: [
    { test: 'tools/fas18_ai_vibe_3d_manufacturing_acceptance.js', reason: 'Upstream ZIP omits tonearm_session_2026-07-05T18-53-03.json required by the harness.' },
    { test: 'tools/td051b_schema_reference_cleanup_acceptance.js', reason: 'Harness requires the external Python jsonschema package; equivalent runtime-schema guards remain in the portable suite.' },
    { test: 'tools/td052_freeform_schema_acceptance.js', reason: 'Harness requires the external Python jsonschema package; equivalent runtime-schema guards remain in the portable suite.' }
  ],
  failures: failed
};
console.log(JSON.stringify(summary, null, 2));
if (failed.length) process.exitCode = 1;
