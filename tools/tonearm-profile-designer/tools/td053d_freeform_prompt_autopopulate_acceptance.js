/**
 * AI-CODING NOTE:
 * Responsibility: Preserve the imported TD053F td053d_freeform_prompt_autopopulate_acceptance.js behavior as a cohesive legacy module.
 * Inputs/Outputs: Defined by the module's public globals and the retained upstream acceptance harnesses.
 * Safe edits: Targeted fixes with direct consumer and regression verification.
 * Do not: Mechanically split this legacy module during the behavior-preserving port or weaken its source/audit boundaries.
 * Verification: npm test and repository release gates.
 */
// SPDX-License-Identifier: 0BSD
// TD053D acceptance. Local source/Node checks only; no browser/WebGL/CAD/FEA/manufacturing claim.
const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..');
function load(rel) { require(path.join(ROOT, rel)); }
function fail(msg) { throw new Error(msg); }
function assert(cond, msg) { if (!cond) fail(msg); }
const checks = [];
function check(name, fn) {
  try { fn(); checks.push({ name, status: 'PASS' }); }
  catch (err) { checks.push({ name, status: 'FAIL', error: String(err && err.message || err) }); process.exitCode = 1; }
}

const runtime = fs.readFileSync(path.join(ROOT, 'js/freeform-runtime-integration.js'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

check('openWorkbench auto-populates prompt', () => {
  assert(/function openWorkbench\(\)[\s\S]*populateWorkbenchPrompt\(root\.state \|\| \{\}, false\)/.test(runtime), 'openWorkbench does not call populateWorkbenchPrompt');
  assert(runtime.includes('Freeform AI Workbench opened with auto-populated TD053D prompt'), 'open status lacks autopopulate claim');
});

check('copy prompt both populates prompt field and requests clipboard copy', () => {
  assert(runtime.includes('function populateWorkbenchPrompt'), 'populateWorkbenchPrompt missing');
  assert(/function copyWorkbenchPrompt[\s\S]*populateWorkbenchPrompt\(appState, true\)/.test(runtime), 'copyWorkbenchPrompt does not request clipboard copy through populateWorkbenchPrompt');
  assert(runtime.includes('root.navigator.clipboard'), 'clipboard write path missing');
});

check('prompt contract contains schema/context/authority language', () => {
  ['geometryMode','freeformPreset','physicalAnalysisPolicy','TD053D EXTRA CONTRACT','app/kernel owns deterministic'].forEach(term => assert(runtime.includes(term) || html.includes(term), 'missing prompt term ' + term));
});

console.log(JSON.stringify({ checks }, null, 2));
