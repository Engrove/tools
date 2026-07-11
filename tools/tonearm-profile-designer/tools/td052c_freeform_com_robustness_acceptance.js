/**
 * AI-CODING NOTE:
 * Responsibility: Preserve the imported TD053F td052c_freeform_com_robustness_acceptance.js behavior as a cohesive legacy module.
 * Inputs/Outputs: Defined by the module's public globals and the retained upstream acceptance harnesses.
 * Safe edits: Targeted fixes with direct consumer and regression verification.
 * Do not: Mechanically split this legacy module during the behavior-preserving port or weaken its source/audit boundaries.
 * Verification: npm test and repository release gates.
 */
// SPDX-License-Identifier: 0BSD
// TD052C freeform COM robustness acceptance.
// Local Node kernel/adapter test; no browser/WebGL/FEA claim.
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
function load(rel) { require(path.join(ROOT, rel)); }
function fail(msg) { throw new Error(msg); }
function assert(cond, msg) { if (!cond) fail(msg); }
function finite(n) { return Number.isFinite(Number(n)); }
function distance(a, b) {
  if (!a || !b) return Infinity;
  const dx = Number(a.x) - Number(b.x);
  const dy = Number(a.y) - Number(b.y);
  const dz = Number(a.z) - Number(b.z);
  return Math.sqrt(dx*dx + dy*dy + dz*dz);
}
function inside(com, b, t) {
  return com.x >= b.minX - t && com.x <= b.maxX + t &&
    com.y >= b.minY - t && com.y <= b.maxY + t &&
    com.z >= b.minZ - t && com.z <= b.maxZ + t;
}
const checks = [];
function check(name, fn) {
  try { fn(); checks.push({ name, status: 'PASS' }); }
  catch (err) { checks.push({ name, status: 'FAIL', error: String(err && err.message || err) }); process.exitCode = 1; }
}

load('js/freeform-centerline.js');
load('js/freeform-rings.js');
load('js/freeform-features.js');
load('js/freeform-schema.js');
load('js/freeform-loft-kernel.js');
load('js/freeform-analysis-adapter.js');

const K = globalThis.FreeformLoftKernel;
const A = globalThis.FreeformAnalysisAdapter;
const presets = ['long_low_cobra_monocoque', 'straight_low_mass_lt_arm', 'integrated_side_bent_headshell'];

presets.forEach(preset => {
  check('TD052C robust COM metrics for ' + preset, () => {
    const go = K.buildFreeformGeometry(K.defaultState(preset), { stationCount: 18, segmentCount: 32 });
    const adapted = A.makeAdapterInput(go);
    const b = adapted.geometryFields.bounds;
    const metrics = adapted.comSanity && adapted.comSanity.metrics;
    assert(adapted.volume.mm3 > 0, 'volume must be > 0');
    assert(adapted.volume.absTetraVolumeMm3 > 0, 'absTetraVolume must be > 0');
    assert(metrics && finite(metrics.signedAbsVolumeRatio), 'signedAbsVolumeRatio metric missing');
    assert(finite(adapted.COM.x) && finite(adapted.COM.y) && finite(adapted.COM.z), 'reported COM must be finite');
    assert(inside(adapted.COM, b, metrics.bboxToleranceMm || 2), 'reported COM must be inside bbox+tolerance');
    if (metrics.signedAbsVolumeRatio < metrics.signedAbsVolumeRatioMin) {
      assert(metrics.selectedMethod !== 'signed_tetra_mesh', 'low signedAbsVolumeRatio must not use signed COM');
      assert(metrics.signedMethodAccepted === false, 'signedMethodAccepted must be false when ratio below threshold');
    }
    assert(metrics.selectedVsAbsComDistance <= Math.max((metrics.comDisagreementToleranceMm || 40) * 2, 80) ||
      metrics.selectedVsAreaCentroidDistance <= Math.max((metrics.comDisagreementToleranceMm || 40) * 2, 80),
      'reported COM wildly divergent from robust absolute/area centroid');
    assert(adapted.comSanity.status === 'PASS', 'analysis.comSanity.status must be PASS only after robust checks');
    assert(adapted.status !== 'PASS', 'local adapter must not claim full browser/FEA PASS');
  });
});

check('long_low_cobra_monocoque does not report front/stylus COM when robust COM is mid-arm', () => {
  const go = K.buildFreeformGeometry(K.defaultState('long_low_cobra_monocoque'), { stationCount: 18, segmentCount: 32 });
  const adapted = A.makeAdapterInput(go);
  const metrics = adapted.comSanity.metrics;
  const absCom = metrics.absoluteTetraCOM;
  const area = metrics.areaWeightedCentroid;
  assert(absCom && area, 'absolute/area COM metrics missing for Cobra');
  if (absCom.x > 80 && area.x > 80) {
    assert(adapted.COM.x > 50, 'Cobra reported COM.x near stylus/front instead of mid-arm fallback: ' + JSON.stringify({ COM: adapted.COM, absCom, area, metrics }));
  }
  assert(metrics.selectedMethod !== 'signed_tetra_mesh', 'Cobra cancellation case must not select signed tetra COM');
});

console.log(JSON.stringify({ test: path.basename(__filename), checks }, null, 2));
