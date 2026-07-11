/**
 * AI-CODING NOTE:
 * Responsibility: Preserve the imported TD053F td053e_freeform_repair_prompt_acceptance.js behavior as a cohesive legacy module.
 * Inputs/Outputs: Defined by the module's public globals and the retained upstream acceptance harnesses.
 * Safe edits: Targeted fixes with direct consumer and regression verification.
 * Do not: Mechanically split this legacy module during the behavior-preserving port or weaken its source/audit boundaries.
 * Verification: npm test and repository release gates.
 */
// SPDX-License-Identifier: 0BSD
// TD053E acceptance. Local source/Node checks only; no browser/WebGL/CAD/FEA/manufacturing claim.
const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..');
function load(rel) { require(path.join(ROOT, rel)); }
function src(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function fail(msg) { throw new Error(msg); }
function assert(cond, msg) { if (!cond) fail(msg); }
const checks = [];
function check(name, fn) {
  try { fn(); checks.push({ name, status: 'PASS' }); }
  catch (err) { checks.push({ name, status: 'FAIL', error: String(err && err.message || err) }); process.exitCode = 1; }
}

check('repair prompt source includes deterministic feedback fields', () => {
  const runtime = src('js/freeform-runtime-integration.js');
  ['lastValidationStatus','lastTargetCompliance','lastCobraFidelity','lastRepairHints','lastInfeasibilityClassification','activeVsPreviewState'].forEach(term => assert(runtime.includes(term), 'prompt missing ' + term));
  assert(runtime.includes('Do not simply produce another large Cobra-looking loft'), 'repair instruction missing');
  assert(runtime.includes('unsupportedAttributes and infeasible summary'), 'infeasible/unsupportedAttributes instruction missing');
  assert(runtime.includes('Do not fabricate deterministicAnalysis'), 'deterministicAnalysis anti-fabrication missing');
});
check('copy repair prompt button is wired in modal and runtime', () => {
  const html = src('index.html');
  const runtime = src('js/freeform-runtime-integration.js');
  assert(html.includes('freeformCopyRepairPromptBtn') && html.includes('Copy repair prompt'), 'repair prompt button missing');
  assert(runtime.includes('freeformCopyRepairPromptBtn') && runtime.includes('copyWorkbenchPrompt(s)'), 'repair prompt runtime listener missing');
});
console.log(JSON.stringify({ checks }, null, 2));
