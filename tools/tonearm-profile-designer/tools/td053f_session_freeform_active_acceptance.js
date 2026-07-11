/**
 * AI-CODING NOTE:
 * Responsibility: Preserve the imported TD053F td053f_session_freeform_active_acceptance.js behavior as a cohesive legacy module.
 * Inputs/Outputs: Defined by the module's public globals and the retained upstream acceptance harnesses.
 * Safe edits: Targeted fixes with direct consumer and regression verification.
 * Do not: Mechanically split this legacy module during the behavior-preserving port or weaken its source/audit boundaries.
 * Verification: npm test and repository release gates.
 */
// SPDX-License-Identifier: 0BSD
// TD053F acceptance. Local source/Node checks only; browser manual validation is NOT_TESTED here.
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

load('js/freeform-live-state-binding.js');

check('session module persists canonical active/preview/apply fields', () => {
  const session = src('js/session.js');
  ['freeformLoftActive','freeformLoftPreview','freeformApplyState','freeformLastAcceptedAnalysis','geometryModeAudit','sessionSnapshot'].forEach(term => assert(session.includes(term), 'session missing ' + term));
});
check('session snapshot includes accepted active freeform fields', () => {
  const B = globalThis.FreeformLiveStateBinding;
  const s = {
    geometryMode: 'freeform',
    freeformLoftActive: { role: 'active', revision: 'active-session', centerline: { points: [] }, rings: [] },
    freeformApplyState: { phase: 'ACCEPTED_ACTIVE' },
    freeformLastAcceptedAnalysis: { targetCompliance: { status: 'PASS_WITH_SCOPE' } }
  };
  const snap = B.sessionSnapshot(s);
  assert(snap.geometryMode === 'freeform', 'snapshot geometryMode mismatch');
  assert(snap.freeformLoftActive && snap.freeformLoftActive.revision === 'active-session', 'active not in snapshot');
  assert(snap.freeformApplyState.phase === 'ACCEPTED_ACTIVE', 'apply phase missing');
  assert(snap.freeformLastAcceptedAnalysis, 'accepted analysis missing');
  assert(snap.geometryModeAudit.status === 'PASS_WITH_SCOPE', 'audit not pass with active freeform');
});
console.log(JSON.stringify({ checks }, null, 2));
