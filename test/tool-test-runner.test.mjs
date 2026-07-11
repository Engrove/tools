/**
 * AI-CODING NOTE:
 * Responsibility: Verify root tool-test classification and non-zero failure propagation without modifying real tool manifests.
 * Inputs: Temporary package fixtures and injected deterministic process results.
 * Outputs: Node built-in test assertions for pass, fail, not-applicable, and aggregate failure behavior.
 * Safe edits: Focused regression cases for the root tool-test runner.
 * Do not: Depend on network access, external test packages, or the real Tonearm package manifest.
 * Verification: node --test test/tool-test-runner.test.mjs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { evaluateTool, runPublicToolTests } from '../scripts/lib/tool-test-runner.mjs';

async function fixture(t, slug, manifest) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'engrove-tool-gate-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  if (manifest !== null) await fs.writeFile(path.join(root, 'package.json'), JSON.stringify(manifest));
  return { slug, sourceDir: root };
}

const runnerWithTestStatus = (status) => ({ phase }) => ({ status: phase === 'test' ? status : 0, signal: null });

test('exit 0 is classified as PASSED', async (t) => {
  const tool = await fixture(t, 'passing-tool', { scripts: { test: 'node test.js' } });
  const result = await evaluateTool(tool, { processRunner: runnerWithTestStatus(0) });
  assert.equal(result.classification, 'PASSED');
  assert.equal(result.exitStatus, 0);
});

test('non-zero exit is classified as FAILED', async (t) => {
  const tool = await fixture(t, 'failing-tool', { scripts: { test: 'node test.js' } });
  const result = await evaluateTool(tool, { processRunner: runnerWithTestStatus(7) });
  assert.equal(result.classification, 'FAILED');
  assert.equal(result.exitStatus, 7);
});

test('missing test command is NOT_APPLICABLE', async (t) => {
  const tool = await fixture(t, 'static-tool', { scripts: { build: 'node build.js' } });
  const result = await evaluateTool(tool, { processRunner: () => assert.fail('runner must not be called') });
  assert.equal(result.classification, 'NOT_APPLICABLE');
  assert.equal(result.exitStatus, null);
});

test('one failed tool yields aggregate FAIL suitable for non-zero CLI exit', async (t) => {
  const passing = await fixture(t, 'z-passing', { scripts: { test: 'node test.js' } });
  const failing = await fixture(t, 'a-failing', { scripts: { test: 'node test.js' } });
  const summary = await runPublicToolTests([passing, failing], {
    processRunner: ({ tool }) => ({ status: tool.slug === 'a-failing' ? 3 : 0, signal: null })
  });
  assert.equal(summary.status, 'FAIL');
  assert.equal(summary.failed, 1);
  assert.deepEqual(summary.tools.map((tool) => tool.slug), ['a-failing', 'z-passing']);
  assert.equal(summary.status === 'PASS' ? 0 : 1, 1);
});
