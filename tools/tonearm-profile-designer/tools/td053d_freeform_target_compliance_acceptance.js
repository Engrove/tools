/**
 * AI-CODING NOTE:
 * Responsibility: Preserve the imported TD053F td053d_freeform_target_compliance_acceptance.js behavior as a cohesive legacy module.
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

['js/freeform-target-compliance.js'].forEach(load);

const T = globalThis.FreeformTargetCompliance;
check('gross mass/effective-mass/LF misses become TARGET_FAIL/BLOCKER', () => {
  const a = {
    massG: 432.452824,
    movingMassG: 432.452824,
    effectiveMassVerticalG: 116.262757,
    effectiveMassHorizontalG: 116.470553,
    cartridgeArmResonanceVerticalHz: 4.13822,
    cartridgeArmResonanceHorizontalHz: 4.13822,
    counterweightBalanceResidualGmm: 20
  };
  const result = T.evaluateTargetCompliance(a, { massG: 36, movingMassG: 36, effectiveMassVerticalG: 13, effectiveMassHorizontalG: 13, lfResonanceHz: 10 }, {});
  assert(result.mass === 'FAIL', 'mass should fail');
  assert(result.effectiveMass === 'FAIL', 'effectiveMass should fail');
  assert(result.lfResonance === 'FAIL', 'lfResonance should fail');
  assert(result.overall === 'BLOCKER', 'overall should be BLOCKER');
  assert(result.status === 'TARGET_FAIL', 'status should be TARGET_FAIL');
});
check('within tolerance values are PASS_WITH_SCOPE', () => {
  const a = { massG: 35, effectiveMassVerticalG: 12.5, effectiveMassHorizontalG: 12.8, cartridgeArmResonanceVerticalHz: 9.8, cartridgeArmResonanceHorizontalHz: 10.2, counterweightBalanceResidualGmm: 20 };
  const result = T.evaluateTargetCompliance(a, { massG: 36, effectiveMassVerticalG: 13, effectiveMassHorizontalG: 13, lfResonanceHz: 10, counterweightBalanceResidualMaxGmm: 250 }, {});
  assert(result.overall === 'PASS_WITH_SCOPE', 'expected PASS_WITH_SCOPE, got ' + JSON.stringify(result));
});
console.log(JSON.stringify({ checks }, null, 2));
