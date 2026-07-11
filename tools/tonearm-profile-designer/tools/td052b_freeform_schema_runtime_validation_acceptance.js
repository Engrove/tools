/**
 * AI-CODING NOTE:
 * Responsibility: Preserve the imported TD053F td052b_freeform_schema_runtime_validation_acceptance.js behavior as a cohesive legacy module.
 * Inputs/Outputs: Defined by the module's public globals and the retained upstream acceptance harnesses.
 * Safe edits: Targeted fixes with direct consumer and regression verification.
 * Do not: Mechanically split this legacy module during the behavior-preserving port or weaken its source/audit boundaries.
 * Verification: npm test and repository release gates.
 */
// SPDX-License-Identifier: 0BSD
// TD052B runtime schema validation acceptance.
// Local Node validation of browser-shipped schema object; no browser/WebGL claim.
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
function load(rel) { require(path.join(ROOT, rel)); }
function fail(msg) { throw new Error(msg); }
function assert(cond, msg) { if (!cond) fail(msg); }
function clone(v) { return JSON.parse(JSON.stringify(v)); }
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

const K = globalThis.FreeformLoftKernel;

function expectRejected(name, mutate) {
  const response = clone(K.knownGoodResponse());
  mutate(response);
  const result = K.validateResponse(response);
  assert(result && result.ok === false, name + ' was not rejected');
}

check('known-good response is accepted by runtime schema validator', () => {
  const result = K.validateResponse(K.knownGoodResponse());
  assert(result.ok === true, 'known-good response rejected: ' + result.errors.join('; '));
  assert(K.getRuntimeJsonSchema && K.getRuntimeJsonSchema().$id === 'tonearm_designer_ai_freeform_loft.schema.json', 'runtime schema object not exposed from embedded schema');
});

check('runtime rejects out-of-range ring widthMm=999', () => {
  expectRejected('widthMm=999', r => { r.ringPatch.rings[0].widthMm = 999; });
});

check('runtime rejects out-of-range centerline x=9999', () => {
  expectRejected('centerline x=9999', r => { r.centerlinePatch.points[0].x = 9999; });
});

check('runtime rejects out-of-range counterweight discMassG=9999', () => {
  expectRejected('counterweight discMassG=9999', r => { r.featurePatch.counterweightStack.discMassG = 9999; });
});

check('runtime rejects unknown and direct mesh/export fields', () => {
  expectRejected('unknown top-level field', r => { r.unknownTop = true; });
  expectRejected('vertices direct field', r => { r.vertices = [[0,0,0]]; });
  expectRejected('faces direct field', r => { r.faces = [[0,1,2]]; });
  expectRejected('triangles direct field', r => { r.triangles = [[0,1,2]]; });
  expectRejected('STL direct field', r => { r.STL = 'solid bad'; });
  expectRejected('OBJ direct field', r => { r.OBJ = 'o bad'; });
});

check('runtime rejects protected legacy/parametric fields', () => {
  expectRejected('rearMode', r => { r.rearMode = 'cobra_integrated_tail'; });
  expectRejected('apex', r => { r.apex = 123; });
  expectRejected('cartX', r => { r.cartX = 10; });
});

check('runtime rejects nested custom controlPoint y=999', () => {
  expectRejected('controlPoints[].y=999', r => {
    r.ringPatch.rings[0].shapeFamily = 'custom_bezier_loop';
    r.ringPatch.rings[0].controlPoints = [{ y: 999, z: 0 }, { y: 0, z: 0 }, { y: 0, z: 0 }, { y: 0, z: 0 }];
  });
});

console.log(JSON.stringify({ test: path.basename(__filename), checks }, null, 2));
