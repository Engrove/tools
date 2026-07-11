#!/usr/bin/env node
// SPDX-License-Identifier: 0BSD
/**
 * AI-CODING NOTE:
 * Responsibility: Regress the explicit empty-start contract and its render/export/session integration markers.
 * Inputs: Current application source files.
 * Outputs: Process status through source-contract assertions.
 * Safe edits: Add markers only when paired with runtime behavior tests.
 * Do not: Treat this source contract as browser/WebGL evidence.
 * Verification: npm test plus desktop browser smoke test.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const config = read('js/config.js');
const ui = read('js/ui.js');
const render3d = read('js/render3d.js');
const render2d = read('js/render2d.js');
const session = read('js/session.js');
const exporters = read('js/exporters.js');
const report = read('js/report-exporter.js');
const html = read('index.html');

assert.match(config, /designLoaded:\s*false/);
assert.match(ui, /state\.designLoaded !== true/);
assert.match(render3d, /state\.designLoaded !== true/);
assert.match(render2d, /state\.designLoaded !== true/);
assert.match(exporters, /Export blocked: no active design exists/);
assert.match(report, /Report export blocked: no active design exists/);
assert.match(session, /designLoaded:/);
assert.match(session, /manualTraceImport:/);
assert.match(html, /id="emptyDesignOverlay"/);
assert.match(html, /id="manualTraceFiles"/);
assert.match(html, /vendor\/three\.min\.js/);
assert.doesNotMatch(html, /<script[^>]+https?:\/\//i);

console.log(JSON.stringify({ status: 'PASS_WITH_SCOPE', test: 'empty-session-contract', assertions: 12 }, null, 2));
