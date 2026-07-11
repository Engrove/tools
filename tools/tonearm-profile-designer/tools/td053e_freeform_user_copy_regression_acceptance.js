/**
 * AI-CODING NOTE:
 * Responsibility: Preserve the imported TD053F td053e_freeform_user_copy_regression_acceptance.js behavior as a cohesive legacy module.
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
  'js/freeform-target-compliance.js',
  'js/freeform-feasibility-solver.js',
  'js/freeform-form-fidelity.js',
  'js/freeform-acceptance-gates.js',
  'js/freeform-apply-state-machine.js'
].forEach(load);
check('operator copy target miss becomes preview-only blocker, not accepted active', () => {
  const analysis = {
    massG: 253.480015,
    effectiveMassVerticalG: 87.060786,
    effectiveMassHorizontalG: 87.130824,
    cartridgeArmResonanceVerticalHz: 4.737238,
    cartridgeArmResonanceHorizontalHz: 4.735475,
    counterweightBalanceResidualGmm: 25309.003556
  };
  const tc = globalThis.FreeformTargetCompliance.evaluateTargetCompliance(analysis, { massG: 36, effectiveMassVerticalG: 12, effectiveMassHorizontalG: 13, lfResonanceHz: 10, counterweightBalanceResidualMaxGmm: 50 }, {});
  const feasibility = globalThis.FreeformFeasibilitySolver.analyzeFeasibility({}, analysis, { massG: 36, effectiveMassVerticalG: 12, effectiveMassHorizontalG: 13, lfResonanceHz: 10, counterweightBalanceResidualMaxGmm: 50 }, {});
  const cobra = {
    status: 'FORM_INTENT_MISMATCH',
    cobraIntentDetected: true,
    cobraFormFidelityScore: 76,
    lowLongProfileScore: 23,
    rearTerminalSeparationScore: 55,
    blockers: ['Cobra intent detected but lowLongProfileScore=23 below required 60']
  };
  const decision = globalThis.FreeformAcceptanceGates.evaluateAcceptance({ targetCompliance: tc, cobraFidelity: cobra, feasibility });
  const s = { freeformLoftActive: { revision: 'active-ok', role: 'active' } };
  const SM = globalThis.FreeformApplyStateMachine;
  SM.ensureState(s);
  SM.markPreview(s, { revision: 'preview-bad', role: 'preview' }, { targetCompliance: tc, cobraFidelity: cobra, feasibility });
  SM.classifyPreview(s, { targetCompliance: tc, cobraFidelity: cobra, feasibility });
  assert(s.freeformApplyState.phase === 'TARGET_FAIL_PREVIEW_ONLY' || s.freeformApplyState.phase === 'INFEASIBLE', 'wrong preview blocker phase ' + s.freeformApplyState.phase);
  const accepted = SM.acceptPreviewAsActive(s, decision, false);
  assert(accepted.ok === false, 'operator-copy failed preview accepted active');
  assert(s.freeformLoftActive.revision === 'active-ok', 'failed preview overwrote active');
  assert(decision.acceptedActiveAllowed === false, 'decision allowed failed copy');
  assert(feasibility.repairHints.some(h => h.metric === 'mass' && h.computed === 253.480015), 'repair prompt data missing mass');
});
check('source has no contradictory status text and audit includes correct state/source', () => {
  const runtime = src('js/freeform-runtime-integration.js');
  const report = src('js/report-exporter.js');
  assert(!runtime.includes('Freeform AI response applied, but deterministic target compliance'), 'contradictory applied-but-failed string remains');
  assert(runtime.includes('active design unchanged'), 'active-unchanged status missing');
  assert(report.includes('Report subject') && report.includes('targetCompliance.status') && report.includes('cobraFidelity.status'), 'report/export audit missing state/source fields');
});
console.log(JSON.stringify({ checks }, null, 2));
