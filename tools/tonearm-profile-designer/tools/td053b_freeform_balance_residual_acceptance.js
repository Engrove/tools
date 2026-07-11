/**
 * AI-CODING NOTE:
 * Responsibility: Preserve the imported TD053F td053b_freeform_balance_residual_acceptance.js behavior as a cohesive legacy module.
 * Inputs/Outputs: Defined by the module's public globals and the retained upstream acceptance harnesses.
 * Safe edits: Targeted fixes with direct consumer and regression verification.
 * Do not: Mechanically split this legacy module during the behavior-preserving port or weaken its source/audit boundaries.
 * Verification: npm test and repository release gates.
 */
// SPDX-License-Identifier: 0BSD
// TD053B balance residual acceptance.
// Local Node moment guard only; no browser/WebGL/FEA/manufacturing claim.
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
function load(rel) { require(path.join(ROOT, rel)); }
function fail(msg) { throw new Error(msg); }
function assert(cond, msg) { if (!cond) fail(msg); }
function finite(n) { return Number.isFinite(Number(n)); }
function relerr(a,b){ return Math.abs(Number(a)-Number(b)) / Math.max(1, Math.abs(Number(b))); }
const checks = [];
function check(name, fn) {
  try { fn(); checks.push({ name, status: 'PASS' }); }
  catch (err) { checks.push({ name, status: 'FAIL', error: String(err && err.message || err) }); process.exitCode = 1; }
}
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
const K = globalThis.FreeformLoftKernel;
const P = globalThis.FreeformPhysicalAnalysis;
const R = globalThis.FreeformResonanceAnalysis;
const presets = ['long_low_cobra_monocoque', 'straight_low_mass_lt_arm', 'integrated_side_bent_headshell'];
const pivot = { x: 237.05, y: 0, z: 0 };
function pointMassTensor(m, p) {
  const dx = Number(p.x) - pivot.x, dy = Number(p.y) - pivot.y, dz = Number(p.z) - pivot.z;
  return {
    Ixx: m * (dy*dy + dz*dz),
    Iyy: m * (dx*dx + dz*dz),
    Izz: m * (dx*dx + dy*dy),
    Ixy: -m * dx * dy,
    Ixz: -m * dx * dz,
    Iyz: -m * dy * dz
  };
}
function add(a,b){ return { Ixx:a.Ixx+b.Ixx, Iyy:a.Iyy+b.Iyy, Izz:a.Izz+b.Izz, Ixy:a.Ixy+b.Ixy, Ixz:a.Ixz+b.Ixz, Iyz:a.Iyz+b.Iyz }; }
function independentBodyInertia(mesh, bodyMassG) {
  const verts = mesh.vertices || [];
  const m = Math.max(0, Number(bodyMassG)) / Math.max(1, verts.length);
  return verts.reduce((acc, v) => add(acc, pointMassTensor(m, v)), { Ixx:0, Iyy:0, Izz:0, Ixy:0, Ixz:0, Iyz:0 });
}
function independentFeatureInertia(featureAnalysis) {
  let t = { Ixx:0, Iyy:0, Izz:0, Ixy:0, Ixz:0, Iyz:0 };
  Object.keys(featureAnalysis || {}).forEach(k => {
    if (k === 'armBody') return;
    const f = featureAnalysis[k] || {};
    const m = Math.max(0, Number(f.massG || 0));
    if (m > 0) t = add(t, pointMassTensor(m, f.COM || pivot));
  });
  return t;
}
function independentTotalInertia(mesh, analysis) {
  return add(independentBodyInertia(mesh, analysis.bodyMassG), independentFeatureInertia(analysis.featureAnalysis));
}
function makeAnalysis(preset) {
  const go = K.buildFreeformGeometry(K.defaultState(preset), { stationCount: 18, segmentCount: 32 });
  const result = P.analyzeFreeformGeometry(go);
  return { go, result, a: result.analysis };
}

presets.forEach(preset => {
  check('TD053B balance residual counted once for ' + preset, () => {
    const { a } = makeAnalysis(preset);
    const bd = a.balanceDebug;
    assert(bd && bd.doubleCountGuard === 'PASS', 'balance double-count guard missing/PASS');
    assert(finite(a.counterweightBalanceResidualGmm), 'reported residual finite');
    const totalMoment = a.massG * (a.totalCOM.x - pivot.x);
    assert(Math.abs(a.counterweightBalanceResidualGmm - totalMoment) <= Math.max(0.01, Math.abs(totalMoment) * 1e-6), 'residual must equal total mass moment around pivot');
    assert(Math.abs(a.counterweightBalanceResidualGmm - bd.explicitBodyFeatureMomentGmm) <= Math.max(0.02, Math.abs(totalMoment) * 1e-5), 'residual must equal explicit body+features moment');
    const oldDoubleCountSignature = bd.totalMomentGmm + bd.counterweightMomentGmm;
    assert(Math.abs(a.counterweightBalanceResidualGmm - oldDoubleCountSignature) > Math.max(1, Math.abs(bd.counterweightMomentGmm) * 0.25), 'old counterweight double-count signature was not rejected');
  });
});

console.log(JSON.stringify(checks, null, 2));
