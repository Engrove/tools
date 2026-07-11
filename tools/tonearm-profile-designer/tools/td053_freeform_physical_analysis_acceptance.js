/**
 * AI-CODING NOTE:
 * Responsibility: Preserve the imported TD053F td053_freeform_physical_analysis_acceptance.js behavior as a cohesive legacy module.
 * Inputs/Outputs: Defined by the module's public globals and the retained upstream acceptance harnesses.
 * Safe edits: Targeted fixes with direct consumer and regression verification.
 * Do not: Mechanically split this legacy module during the behavior-preserving port or weaken its source/audit boundaries.
 * Verification: npm test and repository release gates.
 */
// SPDX-License-Identifier: 0BSD
// TD053 physical analysis acceptance.
// Local Node proxy analysis only; no browser/WebGL/FEA/manufacturing claim.
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

check('TD053 analysis object contains required physical fields', () => {
  const go = K.buildFreeformGeometry(K.defaultState('long_low_cobra_monocoque'), { stationCount: 18, segmentCount: 32 });
  const result = P.analyzeFreeformGeometry(go);
  const a = result.analysis;
  assert(result.ok === true, 'physical analysis result not ok');
  assert(['PASS_WITH_SCOPE','PARTIAL_PASS'].includes(a.status), 'analysis status must be scoped pass/partial');
  ['massG','movingMassG','effectiveMassVerticalG','effectiveMassHorizontalG','pivotInertiaVerticalGmm2','pivotInertiaHorizontalGmm2','counterweightBalanceResidualGmm','cartridgeArmResonanceVerticalHz','cartridgeArmResonanceHorizontalHz','firstBendingModeProxyHz','firstTorsionModeProxyHz','headshellInterfaceModeProxyHz','counterweightAssemblyModeProxyHz'].forEach(k => {
    assert(finite(a[k]), k + ' must be finite');
  });
  assert(a.massG > 0, 'massG must be > 0');
  assert(a.volume.volumeMm3 > 0, 'volume must be > 0');
  assert(a.COM && finite(a.COM.x) && finite(a.COM.y) && finite(a.COM.z), 'COM finite');
  ['Ixx','Iyy','Izz','Ixy','Ixz','Iyz'].forEach(k => assert(finite(a.inertiaTensorPivotGmm2[k]), 'inertia ' + k + ' finite'));
  assert(a.featureAnalysis && a.featureAnalysis.armBody && a.featureAnalysis.counterweightStack, 'feature mass breakdown missing');
  assert(a.inertiaDebug && a.inertiaDebug.doubleCountGuard === 'PASS', 'TD053B inertia double-count guard must PASS');
  assert(a.balanceDebug && a.balanceDebug.doubleCountGuard === 'PASS', 'TD053B balance double-count guard must PASS');
  const len2 = Math.pow(237.05, 2);
  assert(Math.abs(a.effectiveMassVerticalG - a.inertiaTensorPivotGmm2.Iyy / len2) <= 0.00001, 'effective mass must derive from corrected pivot Iyy');
  assert(Math.abs(a.effectiveMassHorizontalG - a.inertiaTensorPivotGmm2.Izz / len2) <= 0.00001, 'effective mass must derive from corrected pivot Izz');
  const totalMoment = a.massG * (a.totalCOM.x - 237.05);
  assert(Math.abs(a.counterweightBalanceResidualGmm - totalMoment) <= Math.max(0.02, Math.abs(totalMoment) * 1e-5), 'counterweight residual must not double-count counterweight');
  assert(Array.isArray(a.warnings), 'warnings array missing');
  assert(/not FEA|not_fea/i.test(a.claimBoundary + ' ' + a.warnings.join(' ')), 'claim boundary must state not FEA');
});

check('TD053 physical analysis is available through runtime integration when loaded', () => {
  load('js/freeform-runtime-integration.js');
  const appState = { geometryMode: 'freeform', freeformLoft: K.defaultState('straight_low_mass_lt_arm') };
  const go = globalThis.FreeformRuntimeIntegration.buildFreeformGeometry(appState, { stationCount: 18, segmentCount: 32 });
  assert(go.analysisInput && go.analysisInput.analysis, 'runtime integration did not attach TD053 analysis');
  assert(appState.freeformLastAnalysis && appState.freeformLastAnalysis.analysis, 'state.freeformLastAnalysis missing TD053 analysis');
  assert(finite(go.analysisInput.analysis.massG) && go.analysisInput.analysis.massG > 0, 'runtime TD053 mass invalid');
});

console.log(JSON.stringify(checks, null, 2));
