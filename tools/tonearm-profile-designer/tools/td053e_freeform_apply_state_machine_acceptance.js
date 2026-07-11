/**
 * AI-CODING NOTE:
 * Responsibility: Preserve the imported TD053F td053e_freeform_apply_state_machine_acceptance.js behavior as a cohesive legacy module.
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

[
  'js/freeform-apply-state-machine.js',
  'js/freeform-acceptance-gates.js',
  'js/freeform-feasibility-solver.js'
].forEach(load);
const SM = globalThis.FreeformApplyStateMachine;
check('state machine exposes TD053E phases', () => {
  ['EMPTY','PARSING','VALIDATION_REJECTED','SCHEMA_VALID','APPLYING_PREVIEW','PREVIEW_READY','TARGET_FAIL_PREVIEW_ONLY','FORM_INTENT_MISMATCH_PREVIEW_ONLY','ACCEPTED_ACTIVE','INFEASIBLE'].forEach(p => assert(SM.PHASES.includes(p), 'missing phase ' + p));
});
check('schema-invalid payload does not change active state', () => {
  const s = { freeformLoftActive: { revision: 'active-a', role: 'active' } };
  SM.ensureState(s);
  SM.markSchemaRejected(s, { name: 'bad_payload' }, ['$.designIntent invalid']);
  assert(s.freeformApplyState.phase === 'VALIDATION_REJECTED', 'wrong phase');
  assert(s.freeformApplyState.activeStateChanged === false, 'active state changed');
  assert(s.freeformLoftActive.revision === 'active-a', 'active revision changed');
  assert(s.freeformLoftRejected && s.freeformLoftRejected.role === 'rejected', 'rejected metadata missing');
});
check('target-failed preview is preview only and cannot accept active', () => {
  const s = { freeformLoftActive: { revision: 'active-a', role: 'active' } };
  SM.ensureState(s);
  SM.markPreview(s, { id: 'preview-body' }, { deterministicAnalysis: { targetCompliance: { status: 'TARGET_FAIL', overall: 'BLOCKER', blockers: ['mass'] } } });
  SM.classifyPreview(s, { targetCompliance: { status: 'TARGET_FAIL', overall: 'BLOCKER', blockers: ['mass'] }, cobraFidelity: { status: 'PASS_WITH_SCOPE' } });
  assert(s.freeformApplyState.phase === 'TARGET_FAIL_PREVIEW_ONLY', 'expected target-fail preview');
  const accepted = SM.acceptPreviewAsActive(s, { acceptedActiveAllowed: false }, false);
  assert(accepted.ok === false, 'target-failed preview was accepted');
  assert(s.freeformLoftActive.revision === 'active-a', 'active overwritten by failed preview');
});
check('target-compliant preview can become accepted active', () => {
  const s = { freeformLoftActive: { revision: 'active-a', role: 'active' } };
  SM.ensureState(s);
  SM.markPreview(s, { id: 'preview-good', rings: [] }, { targetCompliance: { status: 'PASS_WITH_SCOPE' }, cobraFidelity: { status: 'PASS_WITH_SCOPE' } });
  SM.classifyPreview(s, { targetCompliance: { status: 'PASS_WITH_SCOPE' }, cobraFidelity: { status: 'PASS_WITH_SCOPE' } });
  const accepted = SM.acceptPreviewAsActive(s, { acceptedActiveAllowed: true }, false);
  assert(accepted.ok === true, 'accepted active blocked unexpectedly');
  assert(s.freeformApplyState.phase === 'ACCEPTED_ACTIVE', 'not accepted phase');
  assert(s.freeformLoftActive.role === 'active', 'active role missing');
});
check('source avoids contradictory applied/not-applied status for target fail', () => {
  const runtime = src('js/freeform-runtime-integration.js');
  assert(runtime.includes('Preview only — not accepted. Deterministic target compliance is BLOCKER/TARGET_FAIL; active design unchanged.'), 'missing non-contradictory target fail text');
  assert(!runtime.includes('Freeform AI response applied, but deterministic target compliance is BLOCKER/TARGET_FAIL.'), 'old contradictory target-fail text remains');
});
console.log(JSON.stringify({ checks }, null, 2));
