/**
 * AI-CODING NOTE:
 * Responsibility: Preserve the imported TD053F td053e_freeform_feasibility_solver_acceptance.js behavior as a cohesive legacy module.
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

['js/freeform-target-compliance.js','js/freeform-feasibility-solver.js'].forEach(load);
const S = globalThis.FreeformFeasibilitySolver;
check('mass/effective/LF gross misses create BLOCKER repair hints', () => {
  const analysis = {
    massG: 253.480015,
    effectiveMassVerticalG: 87.060786,
    effectiveMassHorizontalG: 87.130824,
    cartridgeArmResonanceVerticalHz: 4.737238,
    cartridgeArmResonanceHorizontalHz: 4.735475,
    counterweightBalanceResidualGmm: 25309.003556
  };
  const result = S.analyzeFeasibility({ freeformLoftPreview: { rings: [{ id: 'r0', widthMm: 20, heightMm: 8, wallThicknessMm: 0.65 }], analysisTargets: { materialDensityGPerCm3: 1.2 } } }, analysis, { massG: 36, effectiveMassVerticalG: 12, effectiveMassHorizontalG: 13, lfResonanceHz: 10, counterweightBalanceResidualMaxGmm: 50 }, {});
  const metrics = result.repairHints.map(h => h.metric);
  assert(metrics.includes('mass'), 'mass hint missing');
  assert(metrics.includes('effectiveMass'), 'effective mass hint missing');
  assert(metrics.includes('lfResonance'), 'LF hint missing');
  assert(metrics.includes('balance'), 'balance hint missing');
  assert(result.repairHints.some(h => h.severity === 'BLOCKER'), 'blocker severity missing');
});
check('greater than 3x miss classifies infeasible or severe', () => {
  const classification = S.classifyInfeasible({ massG: 253.48, effectiveMassVerticalG: 87.06 }, { massG: 36, effectiveMassVerticalG: 12 }, {}, { freeformLoftPreview: { rings: [{ wallThicknessMm: 0.65 }], analysisTargets: { materialDensityGPerCm3: 1.2 } } });
  assert(classification === 'INFEASIBLE_WITH_CURRENT_KERNEL' || classification === 'SEVERE_TARGET_MISS_REPAIR_REQUIRED', 'bad classification ' + classification);
});
check('solver does not claim success under impossible bounds', () => {
  const result = S.analyzeFeasibility({ freeformLoftPreview: { rings: [{ wallThicknessMm: 0.65 }], analysisTargets: { materialDensityGPerCm3: 1.2 } } }, { massG: 432, effectiveMassVerticalG: 116 }, { massG: 36, effectiveMassVerticalG: 12 }, {});
  assert(result.status !== 'FEASIBLE_OR_REPAIRABLE_WITHIN_KERNEL', 'impossible miss falsely succeeded');
});
console.log(JSON.stringify({ checks }, null, 2));
