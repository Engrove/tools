/**
 * AI-CODING NOTE:
 * Responsibility: Preserve the imported TD053F td052_centerline_ring_geometry_acceptance.js behavior as a cohesive legacy module.
 * Inputs/Outputs: Defined by the module's public globals and the retained upstream acceptance harnesses.
 * Safe edits: Targeted fixes with direct consumer and regression verification.
 * Do not: Mechanically split this legacy module during the behavior-preserving port or weaken its source/audit boundaries.
 * Verification: npm test and repository release gates.
 */
// SPDX-License-Identifier: 0BSD
// TD052 Centerline/Ring geometry acceptance.
// Local source/package candidate only; no browser/runtime/Onshape claim.
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
function fail(msg) { throw new Error(msg); }
function assert(cond, msg) { if (!cond) fail(msg); }
function load(rel) { require(path.join(ROOT, rel)); }

const checks = [];
function check(name, fn) {
  try { fn(); checks.push({ name, status: 'PASS' }); }
  catch (err) { checks.push({ name, status: 'FAIL', error: String(err && err.message || err) }); process.exitCode = 1; }
}

load('js/freeform-centerline.js');
load('js/freeform-rings.js');
load('js/freeform-features.js');
load('js/freeform-loft-kernel.js');

const C = globalThis.FreeformCenterline;
const R = globalThis.FreeformRings;
const F = globalThis.FreeformFeatures;
const K = globalThis.FreeformLoftKernel;

function approx(a, b, eps) { return Math.abs(a - b) <= (eps == null ? 1e-9 : eps); }

check('globals registered', () => {
  assert(C && R && F && K, 'TD052 freeform globals not registered');
});

check('centerline locked datums remain fixed under patch', () => {
  const before = C.defaultCenterline().points;
  const patched = C.applyCenterlinePatch(C.defaultCenterline(), {
    points: [
      { id: 'stylus_front', s: 0.2, x: 20, y: 20, z: 20 },
      { id: 'pivot_reference', s: 0.7, x: 111, y: 22, z: -9 },
      { id: 'headshell_interface', s: 0.14, x: 34, y: -4, z: 2.5 }
    ]
  });
  const stylus = patched.points.find(p => p.id === 'stylus_front');
  const pivot = patched.points.find(p => p.id === 'pivot_reference');
  const bStylus = before.find(p => p.id === 'stylus_front');
  const bPivot = before.find(p => p.id === 'pivot_reference');
  assert(approx(stylus.s, bStylus.s) && approx(stylus.x, bStylus.x) && approx(stylus.y, bStylus.y) && approx(stylus.z, bStylus.z), 'stylus_front moved');
  assert(approx(pivot.s, bPivot.s) && approx(pivot.x, bPivot.x) && approx(pivot.y, bPivot.y) && approx(pivot.z, bPivot.z), 'pivot_reference moved');
});

check('ring generator supports required variation families', () => {
  const shapes = [
    { shapeFamily: 'circle', widthMm: 12, heightMm: 12, wallThicknessMm: 1 },
    { shapeFamily: 'triangle', widthMm: 14, heightMm: 12, wallThicknessMm: 1 },
    { shapeFamily: 'sharp_polygon', polygonSides: 4, widthMm: 14, heightMm: 14, wallThicknessMm: 1 },
    { shapeFamily: 'crescent', widthMm: 18, heightMm: 12, wallThicknessMm: 1, crescentCutDepth: 0.45 },
    { shapeFamily: 'custom_bezier_loop', widthMm: 16, heightMm: 10, wallThicknessMm: 1, controlPoints: [
      { y: 0.5, z: 0 }, { y: 0.25, z: 0.5 }, { y: -0.25, z: 0.5 }, { y: -0.5, z: 0 },
      { y: -0.25, z: -0.5 }, { y: 0.25, z: -0.5 }
    ] }
  ];
  shapes.forEach((partial) => {
    const ring = R.sanitizeRing(Object.assign({ id: partial.shapeFamily + '_ring', s: 0.5 }, partial));
    const pts = R.generateRingPoints(ring, 24);
    assert(Array.isArray(pts) && pts.length === 24, 'bad point count for ' + partial.shapeFamily);
    assert(pts.every(p => Number.isFinite(p.y) && Number.isFinite(p.z)), 'non-finite point in ' + partial.shapeFamily);
  });
});

check('known-good loft creates deterministic closed mesh', () => {
  const state = K.defaultState('long_low_cobra_monocoque');
  const a = K.createIntermediateGeometryObject(state, { stationCount: 14, segmentCount: 20 });
  const b = K.createIntermediateGeometryObject(state, { stationCount: 14, segmentCount: 20 });
  assert(a && a.mesh && b && b.mesh, 'mesh missing');
  assert(a.mesh.closed === true, 'mesh not closed');
  assert(K.validateClosedMesh(a.mesh).closed === true, 'validateClosedMesh returned open');
  assert(a.mesh.vertices.length > 100, 'too few vertices');
  assert(a.mesh.faces.length > 100, 'too few faces');
  assert(JSON.stringify(a.mesh.vertices) === JSON.stringify(b.mesh.vertices), 'vertices not deterministic');
  assert(JSON.stringify(a.mesh.faces) === JSON.stringify(b.mesh.faces), 'faces not deterministic');
});

check('all standard presets generate valid intermediate geometry object', () => {
  ['long_low_cobra_monocoque', 'straight_low_mass_lt_arm', 'integrated_side_bent_headshell'].forEach((preset) => {
    const obj = K.createIntermediateGeometryObject(K.defaultState(preset), { stationCount: 12, segmentCount: 16 });
    assert(obj && obj.status === 'PASS_WITH_SCOPE', 'bad object status for ' + preset);
    assert(obj.mesh && obj.mesh.closed === true, 'open mesh for ' + preset);
    assert(obj.requiredAnalysisFields && obj.requiredAnalysisFields.massVolumeComCog === true, 'analysis fields missing for ' + preset);
  });
});

console.log(JSON.stringify({
  status: process.exitCode ? 'FAIL' : 'PASS',
  test: 'td052_centerline_ring_geometry_acceptance',
  checks
}, null, 2));
