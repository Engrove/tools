/**
 * AI-CODING NOTE:
 * Responsibility: Preserve the imported TD053F td052b_freeform_session_persistence_acceptance.js behavior as a cohesive legacy module.
 * Inputs/Outputs: Defined by the module's public globals and the retained upstream acceptance harnesses.
 * Safe edits: Targeted fixes with direct consumer and regression verification.
 * Do not: Mechanically split this legacy module during the behavior-preserving port or weaken its source/audit boundaries.
 * Verification: npm test and repository release gates.
 */
// SPDX-License-Identifier: 0BSD
// TD052B freeform session persistence acceptance.
// Source-level persistence gate plus kernel locked-datum sanity; no browser File API claim.
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function load(rel) { require(path.join(ROOT, rel)); }
function fail(msg) { throw new Error(msg); }
function assert(cond, msg) { if (!cond) fail(msg); }
const checks = [];
function check(name, fn) {
  try { fn(); checks.push({ name, status: 'PASS' }); }
  catch (err) { checks.push({ name, status: 'FAIL', error: String(err && err.message || err) }); process.exitCode = 1; }
}

const session = read('js/session.js');

check('session collect persists geometryMode/freeformLoft/freeformLastAnalysis', () => {
  assert(session.includes('geometryMode:'), 'Session.collect missing geometryMode');
  assert(session.includes('freeformLoft:'), 'Session.collect missing freeformLoft');
  assert(session.includes('freeformLastAnalysis:'), 'Session.collect missing freeformLastAnalysis');
  assert(session.includes('JSON.parse(JSON.stringify(state.freeformLoft))'), 'Session.collect must deep-copy freeformLoft');
});

check('session apply restores freeform runtime state and syncs UI', () => {
  assert(session.includes("data.geometryMode === 'freeform'"), 'Session.apply missing freeform geometryMode restore');
  assert(session.includes('data.freeformLoft'), 'Session.apply missing freeformLoft restore');
  assert(session.includes('FreeformLoftKernel.sanitizeState'), 'Session.apply must sanitize restored freeformLoft');
  assert(session.includes('FreeformRuntimeIntegration.syncTabsFromState'), 'Session.apply must sync freeform tabs after restore');
  assert(session.includes('FreeformRuntimeIntegration.syncAnalysisPanel'), 'Session.apply must sync analysis status after restore');
});

check('locked datums remain locked in kernel after attempted patch', () => {
  load('js/freeform-centerline.js');
  load('js/freeform-rings.js');
  load('js/freeform-features.js');
  load('js/freeform-schema.js');
  load('js/freeform-loft-kernel.js');
  const K = globalThis.FreeformLoftKernel;
  const response = K.knownGoodResponse();
  response.centerlinePatch.points.push({ id: 'stylus_front', s: 0.2, x: 99, y: 10, z: 10 });
  const validation = K.validateResponse(response);
  assert(validation.ok === false, 'protected stylus_front movement must be rejected before session persistence');
});

console.log(JSON.stringify({ test: path.basename(__filename), checks }, null, 2));
