/**
 * AI-CODING NOTE:
 * Responsibility: Preserve the imported TD053F td052_physics_bridge_acceptance.js behavior as a cohesive legacy module.
 * Inputs/Outputs: Defined by the module's public globals and the retained upstream acceptance harnesses.
 * Safe edits: Targeted fixes with direct consumer and regression verification.
 * Do not: Mechanically split this legacy module during the behavior-preserving port or weaken its source/audit boundaries.
 * Verification: npm test and repository release gates.
 */
// SPDX-License-Identifier: 0BSD
// TD052 Freeform physical-analysis bridge acceptance.
// Local source/package candidate only; no browser/runtime/Onshape/FEA claim.
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
load('js/freeform-analysis-adapter.js');

check('analysis adapter receives required geometry fields', () => {
  const geom = globalThis.FreeformLoftKernel.createIntermediateGeometryObject(
    globalThis.FreeformLoftKernel.defaultState('long_low_cobra_monocoque'),
    { stationCount: 14, segmentCount: 20 }
  );
  const adapted = globalThis.FreeformAnalysisAdapter.makeAdapterInput(geom);
  assert(adapted.status === 'PARTIAL_PASS', 'bridge must be PARTIAL_PASS in local scaffold');
  assert(adapted.geometryFields && adapted.geometryFields.vertexCount > 0 && adapted.geometryFields.faceCount > 0, 'geometryFields missing mesh counts');
  assert(adapted.geometryFields.closed === true, 'closed geometry field missing');
  [
    'mass',
    'volume',
    'COM',
    'COG',
    'inertiaTensor',
    'effectiveMassProxy',
    'verticalResonanceEstimate',
    'horizontalResonanceEstimate',
    'EIProxy',
    'firstBendingProxy',
    'wireDuctClearance',
    'cartridgeDatum',
    'headshellDatum',
    'counterweightRelation',
    'printabilityAudit',
    'onshapeAudit'
  ].forEach(key => assert(Object.prototype.hasOwnProperty.call(adapted, key), 'adapter missing ' + key));
  assert(Number.isFinite(adapted.mass.g), 'mass.g not finite');
  assert(Number.isFinite(adapted.volume.mm3), 'volume.mm3 not finite');
  assert(Number.isFinite(adapted.COM.x) && Number.isFinite(adapted.COG.x), 'COM/COG not finite');
  assert(adapted.cartridgeDatum.valid === true, 'cartridge datum invalid');
  assert(adapted.headshellDatum.valid === true, 'headshell datum invalid');
  assert(adapted.onshapeAudit.claim === 'NOT_TESTED', 'onshape audit must remain NOT_TESTED');
});

check('adapter handles all standard presets with partial-pass boundary', () => {
  ['long_low_cobra_monocoque', 'straight_low_mass_lt_arm', 'integrated_side_bent_headshell'].forEach((preset) => {
    const geom = globalThis.FreeformLoftKernel.createIntermediateGeometryObject(
      globalThis.FreeformLoftKernel.defaultState(preset),
      { stationCount: 12, segmentCount: 16 }
    );
    const adapted = globalThis.FreeformAnalysisAdapter.makeAdapterInput(geom);
    assert(adapted.status === 'PARTIAL_PASS', 'status must be PARTIAL_PASS for ' + preset);
    assert(adapted.geometryFields.closed === true, 'mesh not closed for ' + preset);
    assert(adapted.requiredDownstreamFields.mass === true, 'downstream mass flag missing for ' + preset);
    assert(adapted.requiredDownstreamFields.comCog === true, 'downstream COM/COG flag missing for ' + preset);
  });
});

console.log(JSON.stringify({
  status: process.exitCode ? 'FAIL' : 'PASS',
  test: 'td052_physics_bridge_acceptance',
  checks
}, null, 2));
