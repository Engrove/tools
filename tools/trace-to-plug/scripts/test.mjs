#!/usr/bin/env node
/**
 * AI-CODING NOTE:
 * Responsibility: Run every Trace to Plug regression, including the Chromium workflow smoke against the built runtime.
 * Inputs: This tool's test directory.
 * Outputs: Process status plus a scoped machine-readable summary.
 * Safe edits: Additional test entries.
 * Do not: Turn a failure into a skip, add a hardcoded skip list, or report a status the runner did not observe.
 * Verification: npm test.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// The browser smoke reads the built tree, so the build runs first rather than being assumed current.
const build = spawnSync(process.execPath, [path.join('scripts', 'build.mjs')], { cwd: root, encoding: 'utf8' });
if (build.status !== 0) {
    console.log(JSON.stringify({ status: 'FAIL', stage: 'build', stdout: build.stdout, stderr: build.stderr }, null, 2));
    process.exit(1);
}

const tests = [
    path.join('test', 'pattern-mesh.test.cjs'),
    path.join('test', 'pattern-record.test.cjs'),
    path.join('test', 'pattern-pipeline.test.cjs'),
    path.join('test', 'workflow-browser-smoke.mjs')
];

const failed = [];
let assertions = 0;
for (const relative of tests) {
    const result = spawnSync(process.execPath, [relative], { cwd: root, encoding: 'utf8' });
    if (result.status !== 0) {
        failed.push({ test: relative, status: result.status, stdout: result.stdout, stderr: result.stderr });
        continue;
    }
    // Every harness prints its own assertion count. Reading it back is what keeps a test that silently
    // stopped asserting from being reported as a pass.
    try {
        const reported = JSON.parse(result.stdout.slice(result.stdout.indexOf('{')));
        if (!Number.isFinite(reported.assertions) || reported.assertions <= 0) {
            failed.push({ test: relative, status: 0, stdout: result.stdout, stderr: 'The harness reported no assertions.' });
            continue;
        }
        assertions += reported.assertions;
    } catch (error) {
        failed.push({ test: relative, status: 0, stdout: result.stdout, stderr: 'The harness did not print a machine-readable summary: ' + error.message });
    }
}

const summary = {
    status: failed.length ? 'FAIL' : 'PASS_WITH_SCOPE',
    scope: 'Node regressions plus a headless Chromium smoke against the built dist tree; not a deployment check.',
    executed: tests.length,
    passed: tests.length - failed.length,
    failed: failed.length,
    assertions,
    failures: failed
};
console.log(JSON.stringify(summary, null, 2));
if (failed.length) process.exitCode = 1;
