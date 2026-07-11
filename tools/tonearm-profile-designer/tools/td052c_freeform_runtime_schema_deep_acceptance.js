/**
 * AI-CODING NOTE:
 * Responsibility: Preserve the imported TD053F td052c_freeform_runtime_schema_deep_acceptance.js behavior as a cohesive legacy module.
 * Inputs/Outputs: Defined by the module's public globals and the retained upstream acceptance harnesses.
 * Safe edits: Targeted fixes with direct consumer and regression verification.
 * Do not: Mechanically split this legacy module during the behavior-preserving port or weaken its source/audit boundaries.
 * Verification: npm test and repository release gates.
 */
// SPDX-License-Identifier: 0BSD
// TD052C deep runtime schema acceptance.
// Local Node validation of embedded schema walker; no browser/WebGL claim.
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

function responseWithControlPoints(points) {
  const r = clone(K.knownGoodResponse());
  r.ringPatch.rings[0].shapeFamily = 'custom_bezier_loop';
  r.ringPatch.rings[0].controlPoints = points;
  return r;
}

function expectBothRejected(name, mutate) {
  const response = clone(K.knownGoodResponse());
  mutate(response);
  const runtime = K.validateResponse(response);
  const schemaErrors = K.validateResponseAgainstEmbeddedJsonSchema(response);
  assert(runtime && runtime.ok === false, name + ' was not rejected by runtime validateResponse');
  assert(Array.isArray(schemaErrors) && schemaErrors.length > 0, name + ' was not rejected by embedded schema walker');
}

check('known-good and valid custom_bezier_loop controlPoints are accepted', () => {
  const good = responseWithControlPoints([
    { y: -1.0, z: 0.0, r: 1.0 },
    { y: 0.0, z: 1.0, r: 1.0 },
    { y: 1.0, z: 0.0, r: 1.0 },
    { y: 0.0, z: -1.0, r: 1.0 }
  ]);
  const runtime = K.validateResponse(good);
  const schemaErrors = K.validateResponseAgainstEmbeddedJsonSchema(good);
  assert(runtime.ok === true, 'valid custom controlPoints rejected by runtime: ' + runtime.errors.join('; '));
  assert(schemaErrors.length === 0, 'valid custom controlPoints rejected by schema walker: ' + schemaErrors.join('; '));
});

check('controlPoints[].y out of range rejected', () => {
  const badPoints = [{ y: 999, z: 0 }, { y: 0, z: 0 }, { y: 0, z: 0 }, { y: 0, z: 0 }];
  expectBothRejected('controlPoints[].y=999', r => { r.ringPatch.rings[0] = Object.assign(r.ringPatch.rings[0], { shapeFamily: 'custom_bezier_loop', controlPoints: badPoints }); });
});

check('controlPoints[].z out of range rejected', () => {
  const badPoints = [{ y: 0, z: 999 }, { y: 0, z: 0 }, { y: 0, z: 0 }, { y: 0, z: 0 }];
  expectBothRejected('controlPoints[].z=999', r => { r.ringPatch.rings[0] = Object.assign(r.ringPatch.rings[0], { shapeFamily: 'custom_bezier_loop', controlPoints: badPoints }); });
});

check('controlPoints unknown property rejected', () => {
  const badPoints = [{ y: 0, z: 0, bogus: 1 }, { y: 0, z: 0 }, { y: 0, z: 0 }, { y: 0, z: 0 }];
  expectBothRejected('controlPoints unknown property', r => { r.ringPatch.rings[0] = Object.assign(r.ringPatch.rings[0], { shapeFamily: 'custom_bezier_loop', controlPoints: badPoints }); });
});

check('controlPoints below minItems rejected', () => {
  expectBothRejected('controlPoints below minItems', r => { r.ringPatch.rings[0] = Object.assign(r.ringPatch.rings[0], { shapeFamily: 'custom_bezier_loop', controlPoints: [{ y: 0, z: 0 }, { y: 0, z: 0 }, { y: 0, z: 0 }] }); });
});

check('controlPoints above maxItems rejected', () => {
  const tooMany = Array.from({ length: 33 }, () => ({ y: 0, z: 0, r: 1 }));
  expectBothRejected('controlPoints above maxItems', r => { r.ringPatch.rings[0] = Object.assign(r.ringPatch.rings[0], { shapeFamily: 'custom_bezier_loop', controlPoints: tooMany }); });
});

check('custom_polar_profile control point radius out of range rejected', () => {
  const points = [{ y: 0, z: 0, r: 999 }, { y: 0, z: 0, r: 1 }, { y: 0, z: 0, r: 1 }, { y: 0, z: 0, r: 1 }];
  expectBothRejected('custom_polar_profile r=999', r => { r.ringPatch.rings[0] = Object.assign(r.ringPatch.rings[0], { shapeFamily: 'custom_polar_profile', controlPoints: points }); });
});

check('nested unknown centerline/ring/feature properties rejected', () => {
  expectBothRejected('nested unknown centerline property', r => { r.centerlinePatch.points[0].bogus = true; });
  expectBothRejected('nested unknown ring property', r => { r.ringPatch.rings[0].bogus = true; });
  expectBothRejected('nested unknown feature property', r => { r.featurePatch.titaniumMountPlate.bogus = true; });
});

console.log(JSON.stringify({ test: path.basename(__filename), checks }, null, 2));
