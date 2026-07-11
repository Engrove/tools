/**
 * AI-CODING NOTE:
 * Responsibility: Preserve the imported TD053F td053_freeform_effective_mass_resonance_acceptance.js behavior as a cohesive legacy module.
 * Inputs/Outputs: Defined by the module's public globals and the retained upstream acceptance harnesses.
 * Safe edits: Targeted fixes with direct consumer and regression verification.
 * Do not: Mechanically split this legacy module during the behavior-preserving port or weaken its source/audit boundaries.
 * Verification: npm test and repository release gates.
 */
// SPDX-License-Identifier: 0BSD
// TD053 effective mass and LF resonance acceptance.
// Local Node proxy analysis only; no browser/WebGL/FEA claim.
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
function load(rel) { require(path.join(ROOT, rel)); }
function fail(msg) { throw new Error(msg); }
function assert(cond, msg) { if (!cond) fail(msg); }
function finite(n) { return Number.isFinite(Number(n)); }
function clone(v) { return JSON.parse(JSON.stringify(v)); }
const checks = [];
function check(name, fn) {
  try { fn(); checks.push({ name, status: 'PASS' }); }
  catch (err) { checks.push({ name, status: 'FAIL', error: String(err && err.message || err) }); process.exitCode = 1; }
}
function loadTD053() {
  [
    'js/freeform-centerline.js',
    'js/freeform-rings.js',
    'js/freeform-features.js',
    'js/freeform-schema.js',
    'js/freeform-loft-kernel.js',
    'js/freeform-analysis-adapter.js',
    'js/freeform-section-properties.js',
    'js/freeform-resonance-analysis.js',
    'js/freeform-geometry-audit.js',
    'js/freeform-physical-analysis.js'
  ].forEach(load);
}

loadTD053();
const K = globalThis.FreeformLoftKernel;
const P = globalThis.FreeformPhysicalAnalysis;

check('effective mass and LF resonance fields are finite and scoped', () => {
  const state = K.defaultState('integrated_side_bent_headshell');
  state.targets = { complianceVerticalCu: 18, complianceHorizontalCu: 15, cartridgeMassG: 7.5 };
  const go = K.buildFreeformGeometry(state, { stationCount: 18, segmentCount: 32 });
  go.state.targets = clone(state.targets);
  const result = P.analyzeFreeformGeometry(go);
  const a = result.analysis;
  assert(a.effectiveMassVerticalG > 0, 'effectiveMassVerticalG must be > 0');
  assert(a.effectiveMassHorizontalG > 0, 'effectiveMassHorizontalG must be > 0');
  assert(finite(a.cartridgeArmResonanceVerticalHz) && a.cartridgeArmResonanceVerticalHz > 0, 'vertical resonance finite > 0');
  assert(finite(a.cartridgeArmResonanceHorizontalHz) && a.cartridgeArmResonanceHorizontalHz > 0, 'horizontal resonance finite > 0');
  assert(a.lfResonance && Array.isArray(a.lfResonance.targetRangeHz), 'LF target range missing');
  assert(a.lfResonance.targetRangeHz[0] === 8 && a.lfResonance.targetRangeHz[1] === 12, 'LF target range must be 8-12 Hz');
  assert(['PASS','WARN','FAIL','PARTIAL_PASS'].includes(a.lfResonance.status), 'LF status invalid');
  const len2 = Math.pow(237.05, 2);
  assert(Math.abs(a.effectiveMassVerticalG - a.inertiaTensorPivotGmm2.Iyy / len2) <= 0.00001, 'vertical effective mass must derive from corrected inertia');
  assert(Math.abs(a.effectiveMassHorizontalG - a.inertiaTensorPivotGmm2.Izz / len2) <= 0.00001, 'horizontal effective mass must derive from corrected inertia');
  const expectedV = 1000 / (2 * Math.PI * Math.sqrt((a.effectiveMassVerticalG + state.targets.cartridgeMassG) * state.targets.complianceVerticalCu));
  const expectedH = 1000 / (2 * Math.PI * Math.sqrt((a.effectiveMassHorizontalG + state.targets.cartridgeMassG) * state.targets.complianceHorizontalCu));
  assert(Math.abs(a.cartridgeArmResonanceVerticalHz - expectedV) <= 0.00001, 'vertical LF resonance must use corrected effective mass');
  assert(Math.abs(a.cartridgeArmResonanceHorizontalHz - expectedH) <= 0.00001, 'horizontal LF resonance must use corrected effective mass');
});

check('missing cartridge compliance gives PARTIAL_PASS warning, not fake PASS', () => {
  const state = K.defaultState('straight_low_mass_lt_arm');
  const go = K.buildFreeformGeometry(state, { stationCount: 18, segmentCount: 32 });
  const result = P.analyzeFreeformGeometry(go);
  const a = result.analysis;
  assert(a.lfResonance.status === 'PARTIAL_PASS', 'missing compliance must yield PARTIAL_PASS LF status');
  assert((a.warnings || []).some(w => /missing_cartridge_compliance/.test(w)), 'missing compliance warning absent');
});

console.log(JSON.stringify(checks, null, 2));
