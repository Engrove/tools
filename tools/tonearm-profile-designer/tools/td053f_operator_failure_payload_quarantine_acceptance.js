/**
 * AI-CODING NOTE:
 * Responsibility: Preserve the imported TD053F td053f_operator_failure_payload_quarantine_acceptance.js behavior as a cohesive legacy module.
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

function failedPreview() {
  return { role: 'preview', revision: 'preview-failed', centerline: { points: [] }, rings: [] };
}

check('operator target/form failed preview does not overwrite accepted active', () => {
  const B = globalThis.FreeformLiveStateBinding;
  const s = {
    geometryMode: 'freeform',
    freeformLoftActive: { role: 'active', revision: 'active-stable', centerline: { points: [] }, rings: [] },
    freeformApplyState: { phase: 'ACCEPTED_ACTIVE', acceptedActiveRevision: 'active-stable' }
  };
  B.setFreeformPreview(failedPreview(), {
    targetCompliance: { status: 'TARGET_FAIL', overall: 'BLOCKER', blockers: ['mass 253.48 g vs target 36 g'] },
    cobraFidelity: { status: 'FORM_INTENT_MISMATCH', blockers: ['lowLongProfileScore=23 below required 60'] },
    freeformFeasibility: { status: 'INFEASIBLE_WITH_CURRENT_KERNEL' },
    repairHints: [{ metric: 'mass', direction: 'reduce_volume_or_density', computed: 253.48, target: 36, severity: 'BLOCKER' }]
  }, null, s);
  const accepted = B.acceptFreeformPreviewAsActive({
    state: s,
    decision: { acceptedActiveAllowed: false, blockers: ['TARGET_FAIL', 'FORM_INTENT_MISMATCH'] }
  });
  assert(accepted.ok === false, 'failed preview was accepted');
  assert(s.freeformLoftActive.revision === 'active-stable', 'stable active revision changed');
  assert(s.freeformApplyState.phase === 'ACCEPT_BLOCKED', 'apply phase not ACCEPT_BLOCKED');
});
check('repair prompt source includes deterministic failed values and active vs preview state', () => {
  const runtime = src('js/freeform-runtime-integration.js');
  ['lastTargetCompliance','lastCobraFidelity','lastRepairHints','activeVsPreviewState','mass','effective mass','LF resonance'].forEach(term => assert(runtime.includes(term), 'repair prompt missing ' + term));
});
console.log(JSON.stringify({ checks }, null, 2));
