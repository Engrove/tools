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
// No harness is skipped. The two schema acceptances need a real Draft 2020-12 validator, which they
// deliberately take from Python's jsonschema rather than adding an npm dependency, and the manufacturing
// acceptance now reads a repository-owned session fixture. Both prerequisites are provided by the
// environment and by CI, so an unavailable harness is a failure to fix rather than a status to record.
const unavailable = new Set();
const tests = [
  path.join('test', 'manual-trace-adapter.test.cjs'),
  path.join('test', 'manual-trace-freeform-integration.test.cjs'),
  path.join('test', 'empty-session-contract.test.cjs'),
  path.join('test', 'trace-project-package-reader.test.cjs'),
  path.join('test', 'trace-project-package-validator.test.cjs'),
  path.join('test', 'trace-project-package-adapter.test.cjs'),
  path.join('test', 'trace-project-package-roundtrip.test.cjs'),
  path.join('test', 'freeform-plug-mould-audit.test.cjs'),
  path.join('test', 'freeform-pattern-split.test.cjs'),
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
  unavailable: [...unavailable].sort().map(name => ({ test: path.join('tools', name), reason: 'Declared unavailable by the runner.' })),
  failures: failed
};
console.log(JSON.stringify(summary, null, 2));
if (failed.length) process.exitCode = 1;
