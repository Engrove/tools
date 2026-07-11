/**
 * AI-CODING NOTE:
 * Responsibility: Preserve the imported TD053F td053b_freeform_analysis_status_acceptance.js behavior as a cohesive legacy module.
 * Inputs/Outputs: Defined by the module's public globals and the retained upstream acceptance harnesses.
 * Safe edits: Targeted fixes with direct consumer and regression verification.
 * Do not: Mechanically split this legacy module during the behavior-preserving port or weaken its source/audit boundaries.
 * Verification: npm test and repository release gates.
 */
// SPDX-License-Identifier: 0BSD
// TD053B analysis status escalation acceptance.
// Local Node status logic guard only; no browser/WebGL/FEA/manufacturing claim.
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

function classify(core, warnings) {
  return P.classifyAnalysisStatus(core, warnings || ['effective_mass_proxy_not_fea']);
}
check('valid proxy analysis returns scoped non-blocker status', () => {
  const { a } = makeAnalysis('long_low_cobra_monocoque');
  assert(['PARTIAL_PASS','PASS_WITH_SCOPE'].includes(a.status), 'valid proxy analysis should be scoped pass/partial');
  assert(a.status !== 'BLOCKER', 'valid analysis unexpectedly BLOCKER');
});

check('COM sanity blocker escalates to BLOCKER', () => {
  const d = classify({ comSanity: { status: 'BLOCKER' }, inertiaTensorPivotGmm2: { Ixx:1,Iyy:2,Izz:3,Ixy:0,Ixz:0,Iyz:0 }, effectiveMassVerticalG: 1, effectiveMassHorizontalG: 1, resonance: { cartridgeArmResonanceVerticalHz: 10, cartridgeArmResonanceHorizontalHz: 10 }, requiredFields: { massG:true, bodyMassG:true, COM:true, inertiaTensorPivotGmm2:true, effectiveMassVerticalG:true, effectiveMassHorizontalG:true, counterweightBalanceResidualGmm:true } });
  assert(d.status === 'BLOCKER' && d.blockerReasons.includes('com_sanity_blocker'), 'COM blocker did not escalate');
});

check('invalid inertia escalates to BLOCKER', () => {
  const d = classify({ comSanity: { status: 'PASS' }, inertiaTensorPivotGmm2: { Ixx:1,Iyy:-2,Izz:3,Ixy:0,Ixz:0,Iyz:0 }, effectiveMassVerticalG: 1, effectiveMassHorizontalG: 1, resonance: { cartridgeArmResonanceVerticalHz: 10, cartridgeArmResonanceHorizontalHz: 10 }, requiredFields: { massG:true, bodyMassG:true, COM:true, inertiaTensorPivotGmm2:true, effectiveMassVerticalG:true, effectiveMassHorizontalG:true, counterweightBalanceResidualGmm:true } });
  assert(d.status === 'BLOCKER' && d.blockerReasons.includes('invalid_inertia_tensor'), 'invalid inertia did not escalate');
});

check('invalid effective mass escalates to BLOCKER', () => {
  const d = classify({ comSanity: { status: 'PASS' }, inertiaTensorPivotGmm2: { Ixx:1,Iyy:2,Izz:3,Ixy:0,Ixz:0,Iyz:0 }, effectiveMassVerticalG: 0, effectiveMassHorizontalG: 1, resonance: { cartridgeArmResonanceVerticalHz: 10, cartridgeArmResonanceHorizontalHz: 10 }, requiredFields: { massG:true, bodyMassG:true, COM:true, inertiaTensorPivotGmm2:true, effectiveMassVerticalG:false, effectiveMassHorizontalG:true, counterweightBalanceResidualGmm:true } });
  assert(d.status === 'BLOCKER' && d.blockerReasons.includes('invalid_effective_mass'), 'invalid effective mass did not escalate');
});

check('missing required core field escalates to BLOCKER', () => {
  const d = classify({ comSanity: { status: 'PASS' }, inertiaTensorPivotGmm2: { Ixx:1,Iyy:2,Izz:3,Ixy:0,Ixz:0,Iyz:0 }, effectiveMassVerticalG: 1, effectiveMassHorizontalG: 1, resonance: { cartridgeArmResonanceVerticalHz: 10, cartridgeArmResonanceHorizontalHz: 10 }, requiredFields: { massG:false, bodyMassG:true, COM:true, inertiaTensorPivotGmm2:true, effectiveMassVerticalG:true, effectiveMassHorizontalG:true, counterweightBalanceResidualGmm:true } });
  assert(d.status === 'BLOCKER' && d.blockerReasons.includes('missing_required_massG'), 'missing core field did not escalate');
});

console.log(JSON.stringify(checks, null, 2));
